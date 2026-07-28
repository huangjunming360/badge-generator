require "test_helper"

class Api::V1::CardsTest < ActionDispatch::IntegrationTest
  setup do
    @card = Card.create!(
      raw_input: "林思远 清华大学",
      data: { "name" => "林思远", "organization" => "清华大学" }
    )
    @user = User.create!(email_address: "api-test@test.com", password: "test123", password_confirmation: "test123")
    @card.update!(user: @user)
    post session_url, params: { email_address: "api-test@test.com", password: "test123" }
    follow_redirect!
  end

  def body
    JSON.parse(@response.body)
  end

  test "index 返回卡片摘要且不含 raw_input" do
    get api_v1_cards_path
    assert_response :success
    card = body["cards"].first
    assert_equal @card.id, card["id"]
    assert_equal "林思远", card.dig("fields", "name")
    # raw_input 可能是整份简历，列表不该带
    assert_not card.key?("raw_input")
  end

  test "show 返回完整详情含 raw_input 与有效尺寸" do
    get api_v1_card_path(@card)
    assert_response :success
    card = body["card"]
    assert_equal "林思远 清华大学", card["raw_input"]
    # 尺寸暴露的是有效值，永不为 null
    assert_equal Card::DEFAULT_WIDTH_MM, card["width_mm"]
    assert_equal Card::DEFAULT_HEIGHT_MM, card["height_mm"]
    assert card["default_size"]
  end

  test "fields 总是 14 个 key 齐全并叠加默认值" do
    get api_v1_card_path(@card)
    fields = body.dig("card", "fields")
    assert_equal Card::FIELDS.sort, fields.keys.sort
    # 活动字段缺失时由 FIELD_DEFAULTS 补上
    assert_equal "上海交通大学", fields["host_organization"]
  end

  test "未附件时 portrait 为 null" do
    get api_v1_card_path(@card)
    assert_nil body.dig("card", "portrait")
  end

  test "找不到记录返回 404 且是 JSON" do
    get api_v1_card_path(id: 999_999)
    assert_response :not_found
    assert_equal [ "记录不存在" ], body["errors"]
  end

  test "used_ocr 的 nil 被折叠成 false" do
    assert_nil @card.used_ocr
    get api_v1_card_path(@card)
    assert_equal false, body.dig("card", "used_ocr")
  end
end
