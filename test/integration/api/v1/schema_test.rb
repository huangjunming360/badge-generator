require "test_helper"

class Api::V1::SchemaTest < ActionDispatch::IntegrationTest
  setup do
    get api_v1_schema_path
    @body = JSON.parse(@response.body)
  end

  test "返回全部字段定义且顺序与 FIELDS 一致" do
    assert_response :success
    keys = @body["fields"].map { |f| f["key"] }
    assert_equal Card::FIELDS, keys
  end

  test "每个字段都带中文标签" do
    @body["fields"].each do |field|
      assert field["label"].present?, "#{field['key']} 缺少中文标签"
      assert_equal Card::FIELD_LABELS[field["key"]], field["label"]
    end
  end

  test "带出尺寸边界与预览缩放档位供前端做前置校验" do
    size = @body["size"]
    assert_equal Card::DEFAULT_WIDTH_MM, size["default_width_mm"]
    assert_equal Card::DEFAULT_HEIGHT_MM, size["default_height_mm"]
    assert_equal Card::MIN_SIZE_MM, size["min_mm"]
    assert_equal Card::MAX_SIZE_MM, size["max_mm"]

    assert_equal Card::PREVIEW_SCALES, @body.dig("preview", "scales")
  end

  test "带出照片上传约束" do
    assert_equal Card::PORTRAIT_TYPES, @body.dig("portrait", "content_types")
    assert_equal Card::PORTRAIT_MAX_BYTES, @body.dig("portrait", "max_bytes")
  end
end
