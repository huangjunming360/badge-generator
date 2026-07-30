# frozen_string_literal: true

# 实验性功能：让 AI 自主决定提取哪些字段，每个字段可附带 Font Awesome 图标。
# 后台设置中开启后，替换默认的固定字段解析。
class AiFieldParser
  # 精选 FA 图标白名单（与名片信息相关的图标）
  FA_ICONS = {
    "fa-user"          => "姓名/人物",
    "fa-building"      => "公司/机构",
    "fa-phone"         => "电话",
    "fa-envelope"      => "邮箱",
    "fa-globe"         => "网址",
    "fa-map-marker-alt" => "地址",
    "fa-id-card"       => "工号/证件",
    "fa-qrcode"         => "二维码",
    "fa-graduation-cap" => "学历/教育",
    "fa-briefcase"     => "职位/工作",
    "fa-calendar"      => "日期",
    "fa-tag"           => "标签/标语",
    "fa-users"         => "部门/团队",
    "fa-certificate"   => "证书/资质",
    "fa-language"      => "语言",
    "fa-heart"         => "兴趣爱好",
    "fa-linkedin"      => "LinkedIn",
    "fa-github"        => "GitHub",
    "fa-twitter"       => "Twitter/X",
    "fa-hashtag"       => "主题/话题",
    "fa-clock"         => "时间",
    "fa-star"          => "重点/荣誉"
  }.freeze

  def initialize(model_id: nil)
    @model_id = model_id
  end

  # 从 config/llm.yml 加载提示词
  def system_prompt
    config = Rails.application.config.x.llm_functions.dig("ai_field_parse", "prompt") || ""
    # 注入 FA 图标白名单到提示词中
    icons_list = FA_ICONS.map { |k, v| "#{k} = #{v}" }.join("\n    ")
    config.sub("FA_ICONS_PLACEHOLDER", icons_list)
  end

  # 返回动态字段数组 [{key:, value:, label:, icon:}]
  def parse(raw_input)
    response = LlmService.new(model_id: @model_id).complete(
      [ { role: "user", content: raw_input } ],
      system: system_prompt,
      max_tokens: 2048
    )
    fields = JSON.parse(response.strip)
    validate_fields!(fields)
  rescue JSON::ParserError => e
    raise Error, "AI 返回格式错误: #{e.message}"
  end

  class Error < StandardError; end

  private

  def validate_fields!(fields)
    raise Error, "AI 未返回数组" unless fields.is_a?(Array)

    fields.each do |f|
      raise Error, "字段必须是对象" unless f.is_a?(Hash)
      raise Error, "字段缺少 key" if f["key"].blank?
      raise Error, "字段缺少 value" if f["value"].blank?
      raise Error, "字段缺少 label" if f["label"].blank?
      raise Error, "字段缺少 selected" unless f.key?("selected") && [ true, false ].include?(f["selected"])

      # Normalize and clean string fields
      f["key"] = sanitize_string(f["key"].to_s, 50)
      f["value"] = sanitize_string(f["value"].to_s, 500)
      f["label"] = sanitize_string(f["label"].to_s, 50)

      # Validate icon
      next if f["icon"].blank?
      unless FA_ICONS.key?(f["icon"])
        f["icon"] = "fa-tag" # 不合法的图标替换为默认
      end
    end

    fields
  end

  def sanitize_string(str, max_length)
    str.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
       .gsub(/[^\p{Print}\p{Space}]/, "")
       .strip
       .truncate(max_length)
  end
end
