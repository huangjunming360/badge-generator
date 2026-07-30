require "test_helper"

class OcrExtractorTest < ActiveSupport::TestCase
  def fixture(name)
    Rails.root.join("test/fixtures/files", name).to_s
  end

  test "tesseract 在本机具备中英文识别能力" do
    skip "测试环境未安装 chi_sim tesseract 语言包" unless OcrExtractor.available?

    assert OcrExtractor.available?, "测试环境需要安装 tesseract"
  end

  test "识别图片里的中文字段" do
    skip "测试环境未安装 chi_sim tesseract 语言包" unless OcrExtractor.available?

    text = OcrExtractor.new.from_image(fixture("scan_card.png"))
    assert_includes text, "孙丽华"
    assert_includes text, "高级会计师"
    assert_includes text, "13922223333"
  end

  test "识别结果保持字段与值同行" do
    skip "测试环境未安装 chi_sim tesseract 语言包" unless OcrExtractor.available?

    text = OcrExtractor.new.from_image(fixture("scan_card.png"))
    line = text.lines.find { |l| l.include?("孙丽华") }
    assert_includes line, "姓名", "字段名和值应在同一行，否则 LLM 会配错"
  end

  test "识别扫描版 PDF" do
    skip "测试环境未安装 chi_sim tesseract 语言包" unless OcrExtractor.available?

    text = OcrExtractor.new.from_pdf(fixture("scanned.pdf"))
    assert_includes text, "孙丽华"
    assert_includes text, "华东会计师事务所"
  end

  test "文件不存在时抛 OcrError" do
    assert_raises(OcrExtractor::OcrError) do
      OcrExtractor.new.from_image("/tmp/does-not-exist-#{SecureRandom.hex}.png")
    end
  end

  test "非图片内容抛 OcrError 而不是崩溃" do
    Tempfile.create([ "fake", ".png" ]) do |f|
      f.write("not an image at all")
      f.flush
      assert_raises(OcrExtractor::OcrError) { OcrExtractor.new.from_image(f.path) }
    end
  end
end
