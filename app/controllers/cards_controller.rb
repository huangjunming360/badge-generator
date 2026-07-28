class CardsController < ApplicationController
  def index
    @cards = Card.order(created_at: :desc)
  end

  def new
    @card = Card.new
  end

  def create
    @card = Card.new
    @card.raw_input = resolve_raw_input
    @card.source_name = @source_name
    @card.used_ocr = @used_ocr

    portrait = params[:card]&.[](:portrait)
    @card.portrait.attach(portrait) if portrait.present?

    unless @card.valid?
      return render :new, status: :unprocessable_content
    end

    @card.data = CardExtractor.new(session: session).call(@card.raw_input)
    @card.save!
    redirect_to @card
  rescue DocumentTextExtractor::UnsupportedFormat,
         DocumentTextExtractor::ParseError,
         OcrExtractor::OcrError,
         CardExtractor::ExtractionError,
         LlmService::Error,
         AnthropicClient::Error => e
    @card.errors.add(:base, e.message)
    render :new, status: :unprocessable_content
  end

  def show
    @card = Card.find(params[:id])
  end

  def update
    @card = Card.find(params[:id])

    if @card.update(size_params)
      redirect_to @card
    else
      render :show, status: :unprocessable_content
    end
  end

  private

  # 上传了文件就用文件内容，否则用文本框内容。
  def resolve_raw_input
    file = params[:card]&.[](:document)

    if file.present?
      @source_name = file.original_filename
      extractor = DocumentTextExtractor.new
      text = extractor.call(file)
      @used_ocr = extractor.used_ocr?
      text
    else
      @source_name = nil
      params.require(:card).permit(:raw_input)[:raw_input]
    end
  end

  def size_params
    params.require(:card).permit(:width_mm, :height_mm)
  end
end
