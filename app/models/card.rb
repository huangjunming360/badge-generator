class Card < ApplicationRecord
  # 标准化字段。LLM 只能填这些，顺序即展示顺序。
  FIELDS = %w[
    name name_en title department organization
    phone email website address employee_id tagline
  ].freeze

  # 字段中文名，给界面显示用。
  FIELD_LABELS = {
    "name" => "姓名",
    "name_en" => "英文名",
    "title" => "职位",
    "department" => "部门",
    "organization" => "单位",
    "phone" => "电话",
    "email" => "邮箱",
    "website" => "网址",
    "address" => "地址",
    "employee_id" => "工号",
    "tagline" => "标语"
  }.freeze

  validates :raw_input, presence: { message: "请先输入个人资料" }

  # 保证读出来总是 11 个 key 齐全的 Hash，视图不用做 nil 判断。
  def normalized_data
    stored = data.presence || {}
    FIELDS.index_with { |f| stored[f].presence }
  end

  def filled_count
    normalized_data.count { |_, v| v.present? }
  end
end
