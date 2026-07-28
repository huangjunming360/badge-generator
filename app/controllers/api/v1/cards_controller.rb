class Api::V1::CardsController < Api::BaseController
  def index
    cards = Card.order(created_at: :desc)
    render json: { cards: cards.map { |c| serializer(c).as_summary } }
  end

  def show
    card = Card.find(params[:id])
    render json: { card: serializer(card).as_detail }
  end

  # 建卡 = 拿到原始资料 → LLM 提取 → 落库。
  # 支持 multipart（上传文档/照片）和纯 JSON（粘贴文本）两种请求。
  def create
    card = Card.new
    card.raw_input = resolve_raw_input
    card.source_name = @source_name
    card.used_ocr = @used_ocr

    portrait = params[:portrait]
    card.portrait.attach(portrait) if portrait.present?

    return render_validation_errors(card) unless card.valid?

    card.data = CardExtractor.new.call(card.raw_input)
    card.save!
    render json: { card: serializer(card).as_detail }, status: :created
  rescue DocumentTextExtractor::UnsupportedFormat,
         DocumentTextExtractor::ParseError,
         OcrExtractor::OcrError,
         CardExtractor::ExtractionError => e
    render_error(e.message, status: :unprocessable_content)
  rescue LlmService::Error => e
    # LlmService::Error 会穿透 CardExtractor 且不被重试。
    # 模型服务故障是上游问题，不是客户端请求的错，所以用 502。
    render_error(e.message, status: :bad_gateway)
  end

  # 更新字段值与尺寸。字段走整体合并写回：data 列没有默认值，
  # 新记录是 nil，不能直接 data["name"] = x。
  def update
    card = Card.find(params[:id])

    card.assign_attributes(size_params)
    if (incoming = fields_param)
      card.data = card.normalized_data.merge(incoming)
    end
    card.portrait.attach(params[:portrait]) if params[:portrait].present?

    return render_validation_errors(card) unless card.save

    render json: { card: serializer(card).as_detail }
  end

  private

  def serializer(card)
    CardSerializer.new(card, host: request.base_url)
  end

  # 不用 full_messages：它会前缀英文属性名（"Raw input 请先输入个人资料"），
  # 而本项目的校验消息本身已是完整中文句子。字段归属另用 details 给出，
  # 便于前端把错误标在对应输入框上。
  def render_validation_errors(card)
    render json: {
      errors: card.errors.map(&:message),
      details: card.errors.group_by(&:attribute).transform_values { |errs|
        errs.map(&:message)
      }
    }, status: :unprocessable_content
  end

  # 只接受 schema 内的字段，schema 外的键直接丢弃 ——
  # 固定 schema 是产品决策，API 不该成为绕过它的后门。
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

  # 上传了文件就用文件内容，否则用请求里的文本。
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
