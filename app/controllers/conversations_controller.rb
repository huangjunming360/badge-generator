class ConversationsController < ApplicationController
  before_action :set_conversation, only: %i[show destroy]

  def index
    conversation = Conversation.order(updated_at: :desc).first || Conversation.create!
    redirect_to conversation
  end

  def show
    @conversations = Conversation.order(updated_at: :desc)
    @messages = @conversation.messages
  end

  def create
    redirect_to Conversation.create!
  end

  def destroy
    @conversation.destroy!
    redirect_to root_path
  end

  private

  def set_conversation
    @conversation = Conversation.find(params[:id])
  end
end
