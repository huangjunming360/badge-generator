class CardsController < ApplicationController
  def index
    @cards = Card.order(created_at: :desc)
  end

  def new
    @card = Card.new(raw_input: params[:raw_input])
  end

  def create
    @card = Card.new(card_params)

    unless @card.valid?
      return render :new, status: :unprocessable_content
    end

    @card.data = CardExtractor.new.call(@card.raw_input)
    @card.save!
    redirect_to @card
  rescue CardExtractor::ExtractionError, AnthropicClient::Error => e
    @card.errors.add(:base, e.message)
    render :new, status: :unprocessable_content
  end

  def show
    @card = Card.find(params[:id])
  end

  private

  def card_params
    params.require(:card).permit(:raw_input)
  end
end
