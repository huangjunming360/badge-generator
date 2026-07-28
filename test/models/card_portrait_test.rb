require "test_helper"

class CardPortraitTest < ActiveSupport::TestCase
  def upload(name, content_type)
    Rack::Test::UploadedFile.new(
      Rails.root.join("test/fixtures/files", name), content_type
    )
  end

  def card_with(name, content_type)
    card = Card.new(raw_input: "张三，工程师")
    card.portrait.attach(upload(name, content_type))
    card
  end

  test "没有照片时依然有效" do
    assert Card.new(raw_input: "张三").valid?
  end

  test "接受 PNG 证件照" do
    card = card_with("portrait.png", "image/png")
    assert card.valid?, card.errors.full_messages.join(", ")
    assert card.portrait.attached?
  end

  test "接受 JPG 证件照" do
    assert card_with("portrait.jpg", "image/jpeg").valid?
  end

  test "拒绝非图片格式" do
    card = card_with("note.txt", "text/plain")
    assert_not card.valid?
    assert_match "只支持 PNG 或 JPG", card.errors.full_messages.join
  end

  test "拒绝超过 5MB 的照片" do
    card = card_with("portrait.png", "image/png")
    # 直接改 blob 的体积，避免真造一个 5MB 文件拖慢测试。
    card.portrait.blob.byte_size = Card::PORTRAIT_MAX_BYTES + 1
    assert_not card.valid?
    assert_match "不能超过 5MB", card.errors.full_messages.join
  end

  test "照片能持久化并在重新加载后读到" do
    card = card_with("portrait.png", "image/png")
    card.save!
    reloaded = Card.find(card.id)
    assert reloaded.portrait.attached?
    assert_equal "portrait.png", reloaded.portrait.filename.to_s
    assert_equal "image/png", reloaded.portrait.content_type
  end

  test "照片内容与上传的一致" do
    card = card_with("portrait.png", "image/png")
    card.save!
    expected = File.binread(Rails.root.join("test/fixtures/files/portrait.png"))
    assert_equal expected, card.portrait.download
  end
end
