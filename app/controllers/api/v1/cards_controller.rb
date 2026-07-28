class Api::V1::CardsController < Api::BaseController
  rate_limit to: 20, within: 1.minute, only: :create,
    with: -> { render json: { errors: [ "请求过于频繁，请稍后再试" ] }, status: :too_many_requests }

  def index
    cards = Current.user.cards.order(created_at: :desc)
    render json: { cards: cards.map { |c| serializer(c).as_summary } }
  end

  def show
    card = Current.user.cards.find(params[:id])
    render json: { card: serializer(card).as_detail }
  end

  def create
    # sync 参数用于测试，同步等待解析完成
    return create_sync if params[:sync] == "1"

    # 异步：先建卡占位，后台解析
    progress_id = SecureRandom.hex(12)
    card = Current.user.cards.new(raw_input: "解析中…")
    card.save!(validate: false)
    card_id = card.id

    # 原始参数存起来，后台线程用
    raw_input = params[:raw_input]
    model_id = params[:model_id]
    file_data = params[:document]&.read rescue nil
    file_name = params[:document]&.original_filename
    portrait_data = params[:portrait]&.read rescue nil
    portrait_name = params[:portrait]&.original_filename
    user_id = Current.user&.id

    progress = ProgressTracker.new(progress_id)
    progress.set(:uploading, "已提交，排队中…")

    Thread.new do
      begin
        ActiveRecord::Base.connection_pool.with_connection do
          # 在线程中恢复用户上下文
          user = User.find(user_id) if user_id
          Current.session = user&.sessions&.last
          process_card(card_id, raw_input, model_id, file_data, file_name,
                       portrait_data, portrait_name, progress)
        end
      rescue => e
        progress.error(e.message)
        Rails.logger.error("异步解析失败: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      end
    end

    render json: { task_id: progress_id, card_id: card_id }, status: :accepted
  end

  def update
    card = Current.user.cards.find(params[:id])

    card.assign_attributes(size_params)
    if (incoming = fields_param)
      card.data = card.normalized_data.merge(incoming)
    end
    card.portrait.attach(params[:portrait]) if params[:portrait].present?

    return render_validation_errors(card) unless card.save

    render json: { card: serializer(card).as_detail }
  end

  private

  def process_card(card_id, raw_input, model_id, file_data, file_name,
                   portrait_data, portrait_name, progress)
    progress.set(:uploading, "启动解析…")
    card = Card.find(card_id)

    # 处理上传的文件
    text = nil
    if file_data
      progress.set(:mineru, "文档解析中…")
      ext = File.extname(file_name || ".txt").downcase
      tmpfile = Tempfile.new([ "upload", ext ], binmode: true)
      tmpfile.binmode
      tmpfile.write(file_data)
      tmpfile.rewind

      extractor = DocumentTextExtractor.new
      uploaded = ActionDispatch::Http::UploadedFile.new(
        filename: file_name || "file#{ext}",
        type: "application/octet-stream",
        tempfile: tmpfile
      )
      text = extractor.call(uploaded)
      card.used_ocr = extractor.used_ocr?
      card.source_name = file_name

      # MinerU 提取的图片 → 尝试识别大头照
      if extractor.extracted_images.present?
        progress.set(:portrait, "识别大头照…")
        detector = PortraitDetector.new(model_id: Setting.get("portrait_model").presence)
        found = detector.detect(extractor.extracted_images)
        if found
          img = extractor.extracted_images.find { |i| i[:path] == found }
          if img && img[:data].present?
            card.portrait.attach(io: StringIO.new(img[:data]),
              filename: File.basename(img[:path]),
              content_type: "image/#{File.extname(img[:path]).delete('.')}")
          end
        end
      end
    else
      text = raw_input
    end

    card.raw_input = text || raw_input || ""
    return progress.error("提取失败: 无文本内容") if text.blank?

    progress.set(:extracting, "AI 提取字段中…")
    card.data = CardExtractor.new(model_id: model_id).call(text)
    card.save!
    progress.done
  rescue DocumentTextExtractor::UnsupportedFormat,
         DocumentTextExtractor::ParseError,
         OcrExtractor::OcrError,
         CardExtractor::ExtractionError,
         MineruService::Error => e
    progress.error(e.message)
  rescue LlmService::Error => e
    progress.error("AI 服务异常: #{e.message}")
  end

  def create_sync
    card = Current.user.cards.new
    card.raw_input = resolve_raw_input
    card.source_name = @source_name
    card.used_ocr = @used_ocr

    portrait = params[:portrait]
    card.portrait.attach(portrait) if portrait.present?

    return render_validation_errors(card) unless card.valid?

    card.data = CardExtractor.new(model_id: params[:model_id]).call(card.raw_input)
    card.save!
    render json: { card: serializer(card).as_detail }, status: :created
  rescue DocumentTextExtractor::UnsupportedFormat,
         DocumentTextExtractor::ParseError,
         OcrExtractor::OcrError,
         CardExtractor::ExtractionError => e
    render_error(e.message, status: :unprocessable_content)
  rescue LlmService::UnknownModel => e
    render_error(e.message, status: :unprocessable_content)
  rescue LlmService::Error => e
    render_error(e.message, status: :bad_gateway)
  end

  def serializer(card)
    CardSerializer.new(card, host: request.base_url)
  end

  def render_validation_errors(card)
    render json: {
      errors: card.errors.map(&:message),
      details: card.errors.group_by(&:attribute).transform_values { |errs|
        errs.map(&:message)
      }
    }, status: :unprocessable_content
  end

  def fields_param
    raw = params[:fields]
    return nil if raw.blank?
    permitted = raw.permit(*Card::FIELDS).to_h
    permitted.transform_values { |v| v.presence && v.to_s }
  end

  def size_params
    return {} if params[:card].blank?
    params.require(:card).permit(:width_mm, :height_mm)
  end

  def resolve_raw_input
    file = params[:document]

    if file.present?
      @source_name = file.original_filename
      extractor = DocumentTextExtractor.new
      text = extractor.call(file)
      @used_ocr = extractor.used_ocr?
      text
    else
      @source_name = nil
      @used_ocr = false
      params[:raw_input]
    end
  end
end
