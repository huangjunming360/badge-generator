class User < ApplicationRecord
  # 默认权限等级定义（可被 Setting 覆盖）
  # internal: true 的等级不在前端选择菜单中显示，仅程序内部可用
  DEFAULT_LEVELS = {
    0 => { label: "最高", desc: "可用全部模型" },
    1 => { label: "高级", desc: "可用绝大多数模型" },
    2 => { label: "中级", desc: "可用中级及以下模型" },
    3 => { label: "普通", desc: "可用普通及开放模型" },
    4 => { label: "开放", desc: "仅可用开放模型" },
    5 => { label: "系统", desc: "仅系统内部使用", internal: true }
  }.freeze

  def self.model_levels
    stored = Setting.get("level_definitions")
    return DEFAULT_LEVELS if stored.blank?
    parsed = JSON.parse(stored) rescue nil
    return DEFAULT_LEVELS if parsed.blank?
    parsed.transform_keys(&:to_i).transform_values(&:symbolize_keys)
  end

  def self.model_level_labels
    model_levels.transform_values { |v| v[:label] }
  end

  # 仅对外可见的等级（排除 internal 标记的）
  def self.model_levels_ui
    model_levels.reject { |_, v| v[:internal] }
  end

  def self.model_level_labels_ui
    model_levels_ui.transform_values { |v| v[:label] }
  end

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
    User.model_levels.dig(model_level.to_i, :label) || "未知(#{model_level})"
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
