require "test_helper"

class CardExtractorTest < ActiveSupport::TestCase
  # 按预设脚本依次返回回复，记录被调用次数。
  class FakeClient
    attr_reader :calls

    def initialize(*replies)
      @replies = replies
      @calls = 0
    end

    def complete(_messages, system: nil, max_tokens: nil)
      @calls += 1
      @replies[@calls - 1] || @replies.last
    end
  end

  FULL_JSON = {
    "name" => "林小明", "name_en" => "Xiaoming Lin", "title" => "高级产品经理",
    "department" => "用户增长部", "organization" => "某某科技有限公司",
    "phone" => "13800138000", "email" => "lin@example.com",
    "website" => nil, "address" => "深圳市南山区科技园",
    "employee_id" => nil, "tagline" => "让增长有迹可循"
  }.freeze

  def extract(*replies)
    client = FakeClient.new(*replies)
    [ CardExtractor.new(client: client).call("随便一段资料"), client ]
  end

  test "正常 JSON 提取出全部 11 个字段" do
    result, = extract(JSON.generate(FULL_JSON))
    assert_equal Card::FIELDS.sort, result.keys.sort
    assert_equal "林小明", result["name"]
    assert_equal "让增长有迹可循", result["tagline"]
    assert_nil result["website"]
  end

  test "剥离 markdown 代码围栏" do
    result, = extract("```json\n#{JSON.generate(FULL_JSON)}\n```")
    assert_equal "林小明", result["name"]
  end

  test "忽略 JSON 前后的多余说明文字" do
    result, = extract("好的，这是提取结果：\n#{JSON.generate(FULL_JSON)}\n希望有帮助！")
    assert_equal "林小明", result["name"]
  end

  test "丢弃 schema 之外的字段" do
    result, = extract(JSON.generate(FULL_JSON.merge("blood_type" => "A", "zodiac" => "狮子座")))
    assert_equal Card::FIELDS.sort, result.keys.sort
    assert_not_includes result.keys, "blood_type"
  end

  test "缺失字段补 nil" do
    result, = extract(JSON.generate({ "name" => "林小明" }))
    assert_equal Card::FIELDS.size, result.size
    assert_equal "林小明", result["name"]
    assert_nil result["phone"]
  end

  test "空串和字面 null 归一为 nil" do
    result, = extract(JSON.generate({ "name" => "林小明", "phone" => "  ", "email" => "null" }))
    assert_nil result["phone"]
    assert_nil result["email"]
  end

  test "嵌套结构的值当作缺失处理" do
    result, = extract(JSON.generate({ "name" => "林小明", "phone" => %w[1 2] }))
    assert_nil result["phone"]
  end

  test "值统一去空白并转字符串" do
    result, = extract(JSON.generate({ "name" => "  林小明  ", "employee_id" => 10086 }))
    assert_equal "林小明", result["name"]
    assert_equal "10086", result["employee_id"]
  end

  test "首次返回非 JSON 时重试一次即成功" do
    result, client = extract("抱歉我不知道", JSON.generate(FULL_JSON))
    assert_equal "林小明", result["name"]
    assert_equal 2, client.calls
  end

  test "两次都返回非 JSON 则抛 ExtractionError" do
    client = FakeClient.new("不行", "还是不行")
    error = assert_raises(CardExtractor::ExtractionError) do
      CardExtractor.new(client: client).call("资料")
    end
    assert_equal 2, client.calls
    assert_match "没能返回可用的结果", error.message
  end

  test "输入为空直接报错且不调用模型" do
    client = FakeClient.new(JSON.generate(FULL_JSON))
    assert_raises(CardExtractor::ExtractionError) do
      CardExtractor.new(client: client).call("   ")
    end
    assert_equal 0, client.calls
  end
end
