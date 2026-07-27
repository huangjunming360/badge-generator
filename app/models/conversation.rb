class Conversation < ApplicationRecord
  has_many :messages, -> { order(:created_at) }, dependent: :destroy

  # 送进模型的上下文条数上限，避免历史无限增长把请求撑爆。
  CONTEXT_LIMIT = 40

  def display_title
    title.presence || "新对话"
  end

  # 按时间顺序取最近 N 条，转成 Anthropic messages 格式。
  # 这就是"记忆"：每次提问都把这段历史一起发过去。
  def context_messages
    messages.where(role: %w[user assistant])
            .where.not(content: [ nil, "" ])
            .last(CONTEXT_LIMIT)
            .map { |m| { role: m.role, content: m.content } }
  end
end
