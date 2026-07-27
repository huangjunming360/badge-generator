class Message < ApplicationRecord
  belongs_to :conversation

  ROLES = %w[user assistant].freeze

  validates :role, inclusion: { in: ROLES }

  def user? = role == "user"
end
