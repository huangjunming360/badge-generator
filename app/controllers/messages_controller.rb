class MessagesController < ApplicationController
  def create
    conversation = Conversation.find(params[:conversation_id])
    content = params.require(:message).permit(:content)[:content].to_s.strip

    if content.empty?
      return redirect_to conversation, alert: "请先输入内容"
    end

    user_message = conversation.messages.create!(role: "user", content: content)
    # 首条提问用作会话标题，方便侧栏辨认。
    conversation.update!(title: content.truncate(30)) if conversation.title.blank?
    # 先建空的 assistant 占位记录，流式过程往里追加内容。
    reply = conversation.messages.create!(role: "assistant", content: "")

    ReplyJob.perform_later(reply.id)

    respond_to do |format|
      format.turbo_stream do
        render turbo_stream: [
          turbo_stream.append("messages", partial: "messages/message", locals: { message: user_message }),
          turbo_stream.append("messages", partial: "messages/message", locals: { message: reply }),
          turbo_stream.replace("composer", partial: "messages/composer", locals: { conversation: conversation })
        ]
      end
      format.html { redirect_to conversation }
    end
  end
end
