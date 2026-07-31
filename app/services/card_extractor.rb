# 把用户粘贴的自由文本提取成 Card::FIELDS 定义的标准化数据。
class CardExtractor
  class ExtractionError < StandardError; end

  MAX_ATTEMPTS = 2

  SYSTEM_PROMPT = <<~PROMPT
    你是名片信息提取器。用户会给你一段个人资料，你要从中提取信息，输出一个 JSON 对象。

    必须严格遵守：
    1. 只输出 JSON 对象本身，不要加解释、不要加 markdown 代码围栏。
    2. 只使用下面列出的字段名，不要新增字段。
    3. 资料里没有提到的字段，值填 null。不要猜测、不要编造。
       例外情况见 name_en 和 event_topic_en 的字段说明。
    4. 所有值都是字符串或 null，不要用数组或嵌套对象。

    字段说明：
    - name: 中文姓名
    - name_en: 英文名。资料里明确写了就照抄；没写则由 name 音译生成，
      不要留 null。中文姓名用汉语拼音，格式为「名 姓」，首字母大写，
      复名的拼音连写不加连字符，例如 张三 → San Zhang，欧阳明月 → Mingyue Ouyang。
      name 本身为 null 时 name_en 才填 null。
    - organization: 参加者所属单位。类型不限于公司 —— 学校（大学/中学/小学）、
      医院、研究所、院校下属院系、企业、事业单位、政府机关、社会组织、
      基金会、学术学会、媒体、军队单位等都算。只要是“他从哪个组织来”
      就填这里，不要因为不是公司而留 null。名称照资料原文，不要自行改写或补全。
      若同时出现上级单位和下属部门（如“XX 大学 XX 学院”），完整填入。
    - host_organization: 组织项目的机构
    - host_department: 组织项目的机构部门
    - event_topic: 项目主题（活动/课程名称）
    - event_topic_en: 项目主题的英文名。资料里明确写了就照抄；资料里没写但
      event_topic 有值时，由 event_topic 翻译生成（不要音译）。用地道的英文
      活动名写法，实词首字母大写，例如 中法人工智能暑期学校 →
      Sino-French Summer School on Artificial Intelligence。
      只有当 event_topic 本身为 null 时，event_topic_en 才填 null。

    输出示例（organization 为学校）：
    {"name":"林小明","name_en":"Xiaoming Lin","organization":"北京大学物理学院","host_organization":null,"host_department":null,"event_topic":null,"event_topic_en":null}

    输出示例（资料未写英文名，由中文姓名音译；主题英文由主题翻译）：
    {"name":"王建国","name_en":"Jianguo Wang","organization":"上海市第一人民医院","host_organization":null,"host_department":null,"event_topic":"智能制造研讨会","event_topic_en":"Symposium on Intelligent Manufacturing"}
  PROMPT

  def initialize(client: nil, session: nil, model_id: nil)
    @client = client || LlmService.new(session: session, model_id: model_id)
  end

  # 返回 key 为 Card::FIELDS、值为 String 或 nil 的 Hash。
  def call(raw_input)
    text = raw_input.to_s.strip
    raise ExtractionError, "输入内容为空" if text.empty?

    last_error = nil
    MAX_ATTEMPTS.times do
      reply = @client.complete(
        [ { role: "user", content: text } ],
        system: SYSTEM_PROMPT
      )
      parsed = parse(reply)
      return normalize(parsed) if parsed
      last_error = reply.to_s[0, 200]
    end

    raise ExtractionError, "AI 没能返回可用的结果。原始输出：#{last_error}"
  end

  private

  # LLM 有时会包一层 ```json 围栏或前后带说明文字，都容错掉。
  def parse(reply)
    text = reply.to_s.strip
    text = text.gsub(/\A```(?:json)?\s*/, "").gsub(/\s*```\z/, "")
    # 退一步：从第一个 { 到最后一个 } 之间截取。
    if (first = text.index("{")) && (last = text.rindex("}"))
      text = text[first..last]
    end

    parsed = JSON.parse(text)
    parsed.is_a?(Hash) ? parsed : nil
  rescue JSON::ParserError
    nil
  end

  # 丢弃 schema 外的字段，补齐缺失字段，值统一成 String 或 nil。
  def normalize(parsed)
    Card::FIELDS.index_with do |field|
      value = parsed[field]
      next nil if value.nil? || value.is_a?(Hash) || value.is_a?(Array)

      cleaned = value.to_s.strip
      # name_en 和 event_topic_en 可以是生成字段，不应被通用的 null 规则清空
      # 只有当它们明确为空字符串或字面值 "null" 时才置为 nil
      if %w[name_en event_topic_en].include?(field)
        cleaned.empty? || cleaned.casecmp("null").zero? ? nil : cleaned
      else
        cleaned.empty? || cleaned.casecmp("null").zero? ? nil : cleaned
      end
    end
  end
end
