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

  SYSTEM_PROMPT = <<~PROMPT
    你是一个名片信息提取器。请从以下资料中提取关键字段。
    不要使用固定的字段列表，而是根据资料内容自主决定哪些字段有价值。

    每个字段请提供：
    - key: 字段英文标识（小写，下划线分隔，如 "mobile_phone"）
    - value: 字段值（字符串，资料中没找到就省略这个字段）
    - label: 字段中文显示名（如 "手机号"）
    - icon: 一个 Font Awesome 图标名（从下方列表中选择最匹配的）

    可用图标列表（格式：图标名 = 含义）：
    #{FA_ICONS.map { |k, v| "#{k} = #{v}" }.join("\n    ")}

    每个字段还需要一个 selected 字段（true/false）：
    - selected: true = 建议默认显示在名牌上的核心信息（如姓名、机构、职位）
    - selected: false = 辅助信息（如邮箱、电话、网址），用户可自行勾选

    名牌核心字段判断标准：姓名、机构、部门、职位、项目主题 → 默认选上
    辅助信息：手机、邮箱、地址、网站、工号等 → 不默认选

    输出格式（纯 JSON 数组）：
    [{"key":"name","value":"张三","label":"姓名","icon":"fa-user","selected":true},
     {"key":"mobile","value":"13912345678","label":"手机号","icon":"fa-phone","selected":false}]

    注意：
    1. 只输出 JSON 数组，不要解释文字
    2. 如果某个字段没有合适的图标，使用 "fa-tag"
    3. icon 字段必须从上述可用图标列表中选取
    4. 资料中没有的信息不要编造
    5. selected 字段必须存在，根据字段是否属于名牌核心信息判断
  PROMPT

  def initialize(model_id: nil)
    @model_id = model_id
  end

  # 返回动态字段数组 [{key:, value:, label:, icon:}]
  def parse(raw_input)
    client = LlmService.new(model_id: @model_id)
    response = client.complete(
      [ { role: "user", content: raw_input } ],
      system: SYSTEM_PROMPT,
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
      raise Error, "字段缺少 key" if f["key"].blank?
      raise Error, "字段缺少 value" if f["value"].blank?
      next if f["icon"].blank?

      unless FA_ICONS.key?(f["icon"])
        f["icon"] = "fa-tag" # 不合法的图标替换为默认
      end
    end

    fields
  end
end
