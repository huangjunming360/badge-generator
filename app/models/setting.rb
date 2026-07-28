class Setting < ApplicationRecord
  validates :key, presence: true, uniqueness: true

  # 读取设置，不存在时返回默认值
  def self.get(key, default: nil)
    find_by(key: key)&.value || default
  end

  # 布尔值读取
  def self.bool(key, default: false)
    val = get(key)
    return default if val.nil?
    %w[1 true yes on].include?(val.to_s.downcase)
  end

  # 设置值
  def self.set(key, value)
    setting = find_or_initialize_by(key: key)
    setting.update!(value: value.to_s)
  end
end
