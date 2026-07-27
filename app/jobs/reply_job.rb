class ReplyJob < ApplicationJob
  queue_as :default

  def perform(message_id)
    reply = Message.find(message_id)
    conversation = reply.conversation
    # 上下文里排除这条还空着的占位回复。
    history = conversation.context_messages.reject { |m| m[:content].blank? }

    buffer = +""
    last_push = Time.current

    full = AnthropicClient.new.stream(history) do |delta|
      buffer << delta
      # 攒够一点或间隔到了再推，避免每个 token 一次广播把前端压垮。
      if buffer.bytesize >= 24 || Time.current - last_push > 0.12
        reply.update_columns(content: reply.content + buffer)
        buffer = +""
        last_push = Time.current
        broadcast(reply)
      end
    end

    reply.update!(content: full.presence || "（模型没有返回内容）")
    broadcast(reply, done: true)
  rescue StandardError => e
    Rails.logger.error("ReplyJob 失败: #{e.class}: #{e.message}")
    reply&.update!(content: "出错了：#{e.message}")
    broadcast(reply, done: true) if reply
  end

  private

  def broadcast(reply, done: false)
    Turbo::StreamsChannel.broadcast_replace_to(
      reply.conversation,
      target: "message_#{reply.id}",
      partial: "messages/message",
      locals: { message: reply, streaming: !done }
    )
  end
end
