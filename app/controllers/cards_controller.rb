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

    unless @card.valid?
      return render :new, status: :unprocessable_content
    end

    @card.data = CardExtractor.new.call(@card.raw_input)
    @card.save!
    redirect_to @card
  rescue DocumentTextExtractor::UnsupportedFormat,
         DocumentTextExtractor::ParseError,
         CardExtractor::ExtractionError,
         AnthropicClient::Error => e
    @card.errors.add(:base, e.message)
    render :new, status: :unprocessable_content
  end

  def show
    @card = Card.find(params[:id])
  end

  private

  # 上传了文件就用文件内容，否则用文本框内容。
  def resolve_raw_input
    file = params[:card]&.[](:document)

    if file.present?
      @source_name = file.original_filename
      DocumentTextExtractor.new.call(file)
    else
      @source_name = nil
      params.require(:card).permit(:raw_input)[:raw_input]
    end
  end
end
