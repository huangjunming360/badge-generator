class Api::V1::CardsController < Api::BaseController
  # 速率限制：防止 LLM 额度被刷爆
  rate_limit to: 20, within: 1.minute, only: :create,
    with: -> { render json: { errors: ["请求过于频繁，请稍后再试"] }, status: :too_many_requests }

  def index
    cards = Current.user.cards.order(created_at: :desc)
    render json: { cards: cards.map { |c| serializer(c).as_summary } }
  end

  def show
    card = Current.user.cards.find(params[:id])
    render json: { card: serializer(card).as_detail }
  end

  def create
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
