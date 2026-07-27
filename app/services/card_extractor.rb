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
    4. 所有值都是字符串或 null，不要用数组或嵌套对象。

    字段说明：
    - name: 中文姓名
    - name_en: 英文名或拼音
    - title: 职位、职称
    - department: 所属部门
    - organization: 公司、机构、单位名称
    - phone: 电话号码
    - email: 电子邮箱
    - website: 网站地址
    - address: 办公地址
    - employee_id: 工号、编号
    - tagline: 一句话简介或个人标语

    输出示例：
    {"name":"林小明","name_en":"Xiaoming Lin","title":"高级产品经理","department":"用户增长部","organization":"某某科技有限公司","phone":"13800138000","email":"lin@example.com","website":null,"address":"深圳市南山区科技园","employee_id":null,"tagline":"让增长有迹可循"}
  PROMPT

  def initialize(client: AnthropicClient.new)
    @client = client
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
      cleaned.empty? || cleaned.casecmp("null").zero? ? nil : cleaned
    end
  end
end
