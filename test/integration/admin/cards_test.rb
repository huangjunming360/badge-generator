require "test_helper"

class Admin::CardsTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "admin-cards@test.com",
                          password: "test123", password_confirmation: "test123",
                          role: "admin", active: true)
    @other = User.create!(email_address: "other-cards@test.com",
                          password: "test123", password_confirmation: "test123")

    @mine = Card.create!(user: @admin, raw_input: "x", data: { "name" => "林思远" })
    @theirs = Card.create!(user: @other, raw_input: "y", data: { "name" => "王五" })
  end

  def login_as(email)
    post session_url, params: { email_address: email, password: "test123" }
  end

  test "管理员能看到全部用户的卡片" do
    login_as(@admin.email_address)
    get admin_cards_path

    assert_response :success
    # 管理视角：别人的卡片也要在列表里，否则「历史记录放后台」没有意义
    assert_match(/林思远/, @response.body)
    assert_match(/王五/, @response.body)
  end

  test "可以按用户筛选" do
    login_as(@admin.email_address)
    get admin_cards_path(user_id: @other.id)

    assert_response :success
    assert_match(/王五/, @response.body)
    assert_no_match(/林思远/, @response.body)
  end

  test "普通用户访问不到" do
    login_as(@other.email_address)
    get admin_cards_path

    assert_redirected_to root_path
  end

  test "未登录访问不到" do
    get admin_cards_path
    assert_response :redirect
  end

  test "管理员可以删除任意卡片" do
    login_as(@admin.email_address)

    assert_difference "Card.count", -1 do
      delete admin_card_path(@theirs)
    end
  end

  test "批量删除" do
    login_as(@admin.email_address)

    assert_difference "Card.count", -2 do
      delete batch_admin_cards_path, params: { ids: [ @mine.id, @theirs.id ] }
    end
  end

  test "批量删除没选记录时不炸" do
    login_as(@admin.email_address)

    assert_no_difference "Card.count" do
      delete batch_admin_cards_path, params: { ids: [] }
    end
    assert_redirected_to admin_cards_path
  end
end
