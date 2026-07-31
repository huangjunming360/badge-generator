require "test_helper"

class BadgeTemplateGeneratorTest < ActiveSupport::TestCase
  class FakeClient
    attr_reader :last_messages

    def initialize(response)
      @response = response
    end

    def function_prompt
      "prompt"
    end

    def function_max_tokens
      100
    end

    def complete(messages, **)
      @last_messages = messages
      @response
    end
  end

  test "parses and validates generated source" do
    client = FakeClient.new('{"html":"<h1>{{ card.name }}</h1>","css":"h1 { color: #123456; }","notes":"清晰"}')
    result = BadgeTemplateGenerator.new(client: client).generate(requirement: "蓝色夏令营", complexity: 12)

    assert_equal "<h1>{{ card.name }}</h1>", result["html"]
    assert_equal true, result.dig("validation_report", "valid")
    assert_includes client.last_messages.first[:content], '"complexity":10'
  end

  test "passes canvas dimensions and reference assets to the LLM message" do
    client = FakeClient.new('{"html":"<h1>{{ card.name }}</h1>","css":"h1 { color: #123456; }","notes":""}')
    asset = ActiveStorage::Blob.create_and_upload!(
      io: File.open(Rails.root.join("test/fixtures/files/portrait.png")),
      filename: "portrait.png",
      content_type: "image/png"
    )

    BadgeTemplateGenerator.new(client: client).generate(
      requirement: "科技风",
      width_mm: 85,
      height_mm: 55,
      reference_assets: [ asset ]
    )

    message = client.last_messages.first
    assert_equal [ asset ], message[:attachments]
    assert_includes message[:content], '"width_mm":85.0'
    assert_includes message[:content], '"height_mm":55.0'
    assert_includes message[:content], '"reference_asset_slots":1'
  ensure
    asset&.purge
  end

  test "passes the semantic field contract and rejects undeclared generated fields" do
    fields = [ { "key" => "participant_name", "label" => "参加者姓名" } ]
    client = FakeClient.new('{"html":"<h1>{{ fields.organization }}</h1>","css":"","notes":""}')

    error = assert_raises(BadgeTemplateGenerator::Error) do
      BadgeTemplateGenerator.new(client: client).generate(requirement: "x", semantic_fields: fields)
    end

    assert_includes client.last_messages.first[:content], '"semantic_fields":[{"key":"participant_name","label":"参加者姓名"}]'
    assert_includes error.message, "未声明的语义字段"
  end

  test "rejects unsafe generated source" do
    client = FakeClient.new('{"html":"<script>alert(1)</script>","css":"","notes":""}')

    error = assert_raises(BadgeTemplateGenerator::Error) do
      BadgeTemplateGenerator.new(client: client).generate(requirement: "x")
    end

    assert_match(/不允许/, error.message)
  end

  test "repairs with diagnostics" do
    client = FakeClient.new('{"html":"<div>{{ card.name }}</div>","css":"div { color: red; }","notes":"修复溢出"}')
    result = BadgeTemplateGenerator.new(client: client).repair(
      html: "<div>{{ card.name }}</div>", css: "div {}", diagnostics: "内容溢出"
    )

    assert_equal "修复溢出", result["notes"]
    assert_includes client.last_messages.first[:content], "内容溢出"
  end
end
