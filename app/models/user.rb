class User < ApplicationRecord
  # 权限等级：数字 → 中文描述
  MODEL_LEVELS = {
    0   => "普通",
    10  => "高级",
    50  => "VIP",
    100 => "管理员"
  }.freeze

  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :cards, dependent: :nullify

  normalizes :email_address, with: ->(e) { e.strip.downcase }

  validates :password, length: { minimum: 6, message: "密码至少6位" }, if: :password_required?

  scope :admins, -> { where(role: "admin") }
  scope :active_users, -> { where(active: true) }
  scope :inactive_users, -> { where(active: false) }
  scope :banned, -> { where.not(banned_at: nil) }
  scope :not_banned, -> { where(banned_at: nil) }

  def admin?
    role == "admin"
  end

  def banned?
    banned_at.present?
  end

  def model_level_label
    MODEL_LEVELS[model_level.to_i] || "未知(#{model_level})"
  end

  def ban!
    update!(banned_at: Time.current)
  end

  def unban!
    update!(banned_at: nil)
  end

  def activate!
    update!(active: true)
  end

  def deactivate!
    update!(active: false)
  end

  def active_for_authentication?
    active? && !banned?
  end

  private

  def password_required?
    new_record? || password.present?
  end
end
