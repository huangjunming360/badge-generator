require "test_helper"

class Api::V1::CardsWriteTest < ActionDispatch::IntegrationTest
  # 不打真实模型：提取行为在 card_extractor_test 里已覆盖，
  # 这里只验 HTTP 层的契约。
  class FakeClient
    def initialize(reply) = @reply = reply
    def complete(_messages, system: nil, max_tokens: nil) = @reply
  end

  # minitest 6 移除了 minitest/mock，且项目没有 mocha。
  # 用临时替换单例方法的方式打桩，注入方式沿用项目既有的构造器注入惯例。
  # 关键：真身实例必须在替换 new 之前造好，否则会撞上被替换的 new。
  def with_extractor(instance)
    original = CardExtractor.method(:new)
    CardExtractor.define_singleton_method(:new) { |*, **| instance }
    yield
  ensure
    CardExtractor.define_singleton_method(:new, original)
  end

  def stub_extractor(reply, &)
    with_extractor(CardExtractor.new(client: FakeClient.new(reply)), &)
  end

  def body
    JSON.parse(@response.body)
  end

  test "create 用文本建卡并返回 201" do
    reply = { "name" => "林思远", "organization" => "清华大学" }.to_json

    stub_extractor(reply) do
      post api_v1_cards_path, params: { raw_input: "林思远 清华大学" }
    end

    assert_response :created
    assert_equal "林思远", body.dig("card", "fields", "name")
    assert_equal "林思远 清华大学", body.dig("card", "raw_input")
  end

  test "create 缺 raw_input 返回 422 且不调用模型" do
    called = false
    probe = Object.new
    probe.define_singleton_method(:call) { |*| called = true; {} }

    with_extractor(probe) do
      post api_v1_cards_path, params: { raw_input: "" }
    end

    assert_response :unprocessable_content
    assert_includes body["errors"], "请先输入个人资料"
    assert_not called, "校验失败时不该调用 LLM"
  end

  test "模型服务故障返回 502 而非 500" do
    boom = Class.new do
      def complete(*, **) = raise(LlmService::Error, "AI 服务响应异常: timeout")
    end.new

    with_extractor(CardExtractor.new(client: boom)) do
      post api_v1_cards_path, params: { raw_input: "林思远" }
    end

    assert_response :bad_gateway
    assert_match(/AI 服务响应异常/, body["errors"].first)
  end

  test "update 合并字段而不整体覆盖" do
    card = Card.create!(raw_input: "x", data: { "name" => "林思远", "phone" => "13800138000" })

    patch api_v1_card_path(card), params: { fields: { organization: "清华大学" } }

    assert_response :success
    fields = body.dig("card", "fields")
    assert_equal "清华大学", fields["organization"]
    # 没提到的字段必须留着 —— data 列无默认值，实现上要 merge 而非赋值
    assert_equal "13800138000", fields["phone"]
    assert_equal "林思远", fields["name"]
  end

  test "update 丢弃 schema 外的字段" do
    card = Card.create!(raw_input: "x", data: { "name" => "林思远" })

    patch api_v1_card_path(card), params: { fields: { name: "王五", evil_key: "x" } }

    assert_response :success
    assert_equal "王五", body.dig("card", "fields", "name")
    assert_not body.dig("card", "fields").key?("evil_key")
    assert_not card.reload.data.key?("evil_key")
  end

  test "update 尺寸越界返回 422" do
    card = Card.create!(raw_input: "x")

    patch api_v1_card_path(card), params: { card: { width_mm: Card::MAX_SIZE_MM + 1 } }

    assert_response :unprocessable_content
    assert_match(/需在/, body["errors"].first)
  end

  test "上传照片后 portrait 返回 URL 而非 base64" do
    card = Card.create!(raw_input: "x")
    file = Rack::Test::UploadedFile.new(
      Rails.root.join("test/fixtures/files/portrait.png"), "image/png"
    )

    patch api_v1_card_path(card), params: { portrait: file }

    assert_response :success
    portrait = body.dig("card", "portrait")
    assert_equal "portrait.png", portrait["filename"]
    assert_equal "image/png", portrait["content_type"]
    assert_match %r{\Ahttps?://}, portrait["url"]
  end

  test "拒绝非图片格式的照片" do
    card = Card.create!(raw_input: "x")
    file = Rack::Test::UploadedFile.new(
      Rails.root.join("test/fixtures/files/note.txt"), "text/plain"
    )

    patch api_v1_card_path(card), params: { portrait: file }

    assert_response :unprocessable_content
    assert_match(/PNG 或 JPG/, body["errors"].first)
  end
end
