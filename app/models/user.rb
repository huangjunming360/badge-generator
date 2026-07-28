class User < ApplicationRecord
  # 权限等级：数字越小权限越高。0=最高（管理员），4=开放（所有人）
  # 用户 level ≤ 模型 level 即可访问该模型
  MODEL_LEVELS = {
    0 => "最高",
    1 => "高级",
    2 => "中级",
    3 => "普通",
    4 => "开放"
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
