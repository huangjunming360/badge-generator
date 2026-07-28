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
    return create_sync if params[:sync] == "1"

    progress_id = SecureRandom.hex(12)
    raw_input = params[:raw_input]
    model_id = params[:model_id]
    mineru_enabled = params[:mineru_enabled]
    portrait_detect = params[:portrait_detect]
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
          user = User.find(user_id) if user_id
          Current.session = user&.sessions&.last
          card_id = process_card(raw_input, model_id, file_data, file_name,
                                 portrait_data, portrait_name, progress,
                                 mineru_enabled:, portrait_detect:)
          progress.done(card_id: card_id) if card_id
        end
      rescue => e
        progress.error(e.message)
        Rails.logger.error("异步解析失败: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      end
    end

    render json: { task_id: progress_id }, status: :accepted
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

  def process_card(raw_input, model_id, file_data, file_name,
                   portrait_data, portrait_name, progress,
                   mineru_enabled: nil, portrait_detect: nil)
    progress.set(:uploading, "启动解析…")
    card = Current.user.cards.new

    # 处理上传的文件
    text = nil
    if file_data
      ext = File.extname(file_name || ".txt").downcase
      tmpfile = Tempfile.new([ "upload", ext ], binmode: true)
      tmpfile.binmode
      tmpfile.write(file_data)
      tmpfile.rewind
      uploaded = ActionDispatch::Http::UploadedFile.new(
        filename: file_name || "file#{ext}",
        type: "application/octet-stream",
        tempfile: tmpfile
      )

      use_mineru = mineru_enabled != "0" && Setting.bool("mineru_enabled") && ENV["MINERU_API_KEY"].present?
      mineru_images = []
      if use_mineru
        progress.set(:mineru, "文档解析中…")
        mineru_result = MineruService.new.parse(tmpfile.path, file_name: file_name)
        mineru_images = mineru_result[:images] || []
      end

      extractor = DocumentTextExtractor.new
      text = extractor.call(uploaded)
      card.used_ocr = extractor.used_ocr?
      card.source_name = file_name

      # 尝试识别人像
      if mineru_images.present? && portrait_detect != "0"
        progress.set(:portrait, "人像识别中…")
        detector = PortraitDetector.new(model_id: Setting.get("portrait_model").presence)
        found = detector.detect(mineru_images)
        if found
          img = mineru_images.find { |i| i[:path] == found }
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

    raw = text || raw_input || ""
    return progress.error("提取失败: 无文本内容") if raw.blank?

    # 清理非法字符：null 字节、控制字符（保留换行）
    raw = raw.force_encoding("UTF-8") if raw.encoding == Encoding::BINARY
    raw = raw.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
           .gsub("\x00", "")
           .gsub(/[^\p{Print}\p{Space}]/, "")  # 只保留可打印字符和空白
           .squeeze(" ")
           .strip
    if raw.length > 20_000
      card.raw_input = raw.truncate(20_000)
      card.source_name = [ card.source_name, "（内容过长已截断）" ].compact.join(" ")
    else
      card.raw_input = raw
    end

    progress.set(:extracting, "AI 提取字段中…")
    card.data = CardExtractor.new(model_id: model_id).call(text)
    card.save!
    card.id
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
