require "test_helper"

class BadgeSizeTest < ActionDispatch::IntegrationTest
  setup do
    @card = Card.create!(raw_input: "测试", data: { "name" => "张三", "organization" => "某单位" })
  end

  test "未设置尺寸时用默认值" do
    assert_equal Card::DEFAULT_WIDTH_MM, @card.width
    assert_equal Card::DEFAULT_HEIGHT_MM, @card.height
    assert @card.default_size?
  end

  test "挂牌把尺寸写进内联 CSS 变量" do
    get card_path(@card)
    assert_select ".badge" do |elements|
      style = elements.first["style"]
      assert_includes style, "--badge-width: #{Card::DEFAULT_WIDTH_MM}mm"
      assert_includes style, "--badge-height: #{Card::DEFAULT_HEIGHT_MM}mm"
    end
  end

  test "挂牌带默认预览缩放倍数" do
    get card_path(@card)
    assert_select ".badge" do |elements|
      assert_includes elements.first["style"], "--badge-scale: #{Card::DEFAULT_PREVIEW_SCALE}"
    end
  end

  test "预览缩放不入库，宽高比保持 55:85" do
    # 缩放只是显示倍数，不该被当成尺寸存下来。
    patch card_path(@card), params: { card: {}, preview_scale: 3 }
    @card.reload
    assert_equal Card::DEFAULT_WIDTH_MM, @card.width
    assert_equal Card::DEFAULT_HEIGHT_MM, @card.height
  end

  test "自定义尺寸后挂牌用新值" do
    patch card_path(@card), params: { card: { width_mm: 70, height_mm: 100 } }
    assert_redirected_to card_path(@card)

    follow_redirect!
    assert_select ".badge" do |elements|
      assert_includes elements.first["style"], "--badge-width: 70mm"
      assert_includes elements.first["style"], "--badge-height: 100mm"
    end
  end

  test "自定义尺寸持久化" do
    patch card_path(@card), params: { card: { width_mm: 60, height_mm: 90 } }
    @card.reload
    assert_equal 60, @card.width_mm
    assert_equal 90, @card.height_mm
    assert_not @card.default_size?
  end

  test "尺寸输入框预填当前值" do
    @card.update!(width_mm: 65, height_mm: 95)
    get card_path(@card)
    assert_select "input[name='card[width_mm]'][value='65']"
    assert_select "input[name='card[height_mm]'][value='95']"
  end

  test "超过上限被拒绝" do
    patch card_path(@card), params: { card: { width_mm: Card::MAX_SIZE_MM + 1, height_mm: 85 } }
    assert_response :unprocessable_content
    assert_equal Card::DEFAULT_WIDTH_MM, @card.reload.width
  end

  test "低于下限被拒绝" do
    patch card_path(@card), params: { card: { width_mm: 54, height_mm: Card::MIN_SIZE_MM - 1 } }
    assert_response :unprocessable_content
  end

  test "零和负数被拒绝" do
    [ 0, -10 ].each do |bad|
      patch card_path(@card), params: { card: { width_mm: bad, height_mm: 85 } }
      assert_response :unprocessable_content, "宽度 #{bad} 应被拒绝"
    end
  end

  test "小数被拒绝" do
    patch card_path(@card), params: { card: { width_mm: 54.5, height_mm: 85 } }
    assert_response :unprocessable_content
  end

  test "边界值可用" do
    patch card_path(@card), params: { card: { width_mm: Card::MIN_SIZE_MM, height_mm: Card::MAX_SIZE_MM } }
    assert_redirected_to card_path(@card)
    @card.reload
    assert_equal Card::MIN_SIZE_MM, @card.width_mm
    assert_equal Card::MAX_SIZE_MM, @card.height_mm
  end

  test "被拒绝时页面显示错误信息" do
    patch card_path(@card), params: { card: { width_mm: 999, height_mm: 85 } }
    assert_match "20–200mm 之间", @response.body
  end

  test "页脚显示当前尺寸" do
    @card.update!(width_mm: 70, height_mm: 100)
    get card_path(@card)
    assert_match "70 × 100mm", @response.body
  end
end
