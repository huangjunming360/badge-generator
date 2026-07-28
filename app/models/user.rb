class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy

  normalizes :email_address, with: ->(e) { e.strip.downcase }

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

  def ban!(reason: nil)
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
end
