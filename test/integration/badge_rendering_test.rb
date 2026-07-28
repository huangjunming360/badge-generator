require "test_helper"

class BadgeRenderingTest < ActionDispatch::IntegrationTest
  def create_card(data:, portrait: false)
    card = Card.create!(raw_input: "测试资料", data: data)
    if portrait
      card.portrait.attach(
        Rack::Test::UploadedFile.new(
          Rails.root.join("test/fixtures/files/portrait.png"), "image/png"
        )
      )
    end
    card
  end

  test "挂牌显示姓名和单位" do
    card = create_card(data: { "name" => "钱慧敏", "organization" => "苏州明远建筑设计院" })
    get card_path(card)

    assert_response :success
    assert_select ".badge"
    assert_select ".badge__name", text: /钱慧敏/
    assert_select ".badge__org", text: /苏州明远建筑设计院/
  end

  test "挂牌不显示其他字段" do
    card = create_card(data: {
      "name" => "钱慧敏", "organization" => "明远设计院",
      "phone" => "13611119999", "email" => "qian@myad.cn", "title" => "主任建筑师"
    })
    get card_path(card)

    # 挂牌放照片、主办方抬头（机构/部门/主题）、姓名、单位，个人联系方式不上牌。
    assert_select ".badge__name", text: /钱慧敏/
    assert_no_match "13611119999", @response.body
    assert_no_match "qian@myad.cn", @response.body
  end

  test "挂牌显示主办方机构、部门和项目主题" do
    card = create_card(data: {
      "name" => "钱慧敏",
      "host_organization" => "上海交通大学",
      "host_department" => "自然科学研究院",
      "event_topic" => "中法人工智能暑期学校"
    })
    get card_path(card)

    assert_response :success
    assert_select ".badge__header"
    assert_select ".badge__host-org", text: /上海交通大学/
    assert_select ".badge__host-dept", text: /自然科学研究院/
    assert_select ".badge__topic", text: /中法人工智能暑期学校/
  end

  test "资料没写主办方时挂牌用固定默认值" do
    card = create_card(data: { "name" => "钱慧敏" })
    get card_path(card)

    # 三项走 Card::FIELD_DEFAULTS，不该出现占位文字。
    assert_select ".badge__host-org", text: /上海交通大学/
    assert_select ".badge__host-dept", text: /自然科学研究院/
    assert_select ".badge__topic", text: /中法人工智能暑期学校/
    assert_select ".badge__host-org.badge__placeholder", count: 0
  end

  test "不再输出标准化 JSON" do
    card = create_card(data: { "name" => "钱慧敏", "organization" => "明远设计院" })
    get card_path(card)

    assert_select "pre", count: 0
    assert_no_match "标准化 JSON", @response.body
  end

  test "有照片时渲染图片元素" do
    card = create_card(data: { "name" => "钱慧敏", "organization" => "明远设计院" }, portrait: true)
    get card_path(card)

    assert_select "img.badge__photo"
    assert_select ".badge__photo--empty", count: 0
  end

  test "无照片时显示占位框" do
    card = create_card(data: { "name" => "钱慧敏", "organization" => "明远设计院" })
    get card_path(card)

    assert_select ".badge__photo--empty", text: /无照片/
    assert_select "img.badge__photo", count: 0
  end

  test "姓名缺失时显示占位文字而不塌版" do
    card = create_card(data: { "organization" => "明远设计院" })
    get card_path(card)

    assert_select ".badge__name.badge__placeholder", text: /未识别姓名/
    assert_select ".badge"
  end

  test "单位缺失时显示占位文字" do
    card = create_card(data: { "name" => "钱慧敏" })
    get card_path(card)

    assert_select ".badge__org.badge__placeholder", text: /未识别单位/
  end

  test "挂牌样式表被引入" do
    card = create_card(data: { "name" => "钱慧敏" })
    get card_path(card)

    assert_select "link[rel=stylesheet][href*=badge]"
  end
end
