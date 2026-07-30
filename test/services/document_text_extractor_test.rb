require "test_helper"

class DocumentTextExtractorTest < ActiveSupport::TestCase
  def upload(filename, content: nil)
    if content
      tempfile = Tempfile.new([ "t", File.extname(filename) ], binmode: true)
      tempfile.write(content)
      tempfile.rewind
    else
      tempfile = File.open(Rails.root.join("test/fixtures/files", filename), "rb")
    end
    ActionDispatch::Http::UploadedFile.new(filename: filename, tempfile: tempfile)
  end

  def extract(...)
    DocumentTextExtractor.new.call(upload(...))
  end

  test "解析 docx 段落文字" do
    text = extract("resume.docx")
    assert_includes text, "陈美玲"
    assert_includes text, "北京协和医院"
    assert_includes text, "以患者为先"
  end

  test "解析 pdf 文字" do
    text = extract("profile.pdf")
    assert_includes text, "David Park"
    assert_includes text, "Horizon Design Group"
  end

  test "解析 xlsx 单元格" do
    text = extract("staff.xlsx")
    assert_includes text, "赵晓芸"
    assert_includes text, "招商银行深圳分行"
  end

  test "解析 csv" do
    text = extract("staff.csv")
    assert_includes text, "王建国"
    assert_includes text, "中铁十四局"
  end

  test "解析纯文本" do
    text = extract("note.txt")
    assert_includes text, "刘洋"
  end

  test "图片走 OCR 并标记 used_ocr" do
    extractor = DocumentTextExtractor.new
    text = extractor.call(upload("scan_card.png"))
    assert_includes text, "孙丽华"
    assert extractor.used_ocr?
  end

  test "扫描版 PDF 自动降级到 OCR" do
    extractor = DocumentTextExtractor.new
    text = extractor.call(upload("scanned.pdf"))
    assert_includes text, "孙丽华"
    assert extractor.used_ocr?, "文字层为空的 PDF 应走 OCR"
  end

  test "有文字层的 PDF 不走 OCR" do
    extractor = DocumentTextExtractor.new
    text = extractor.call(upload("profile.pdf"))
    assert_includes text, "David Park"
    assert_not extractor.used_ocr?
  end

  test "非 OCR 路径不标记 used_ocr" do
    extractor = DocumentTextExtractor.new
    extractor.call(upload("note.txt"))
    assert_not extractor.used_ocr?
  end

  test "不支持的扩展名报错并列出支持格式" do
    error = assert_raises(DocumentTextExtractor::UnsupportedFormat) do
      extract("archive.zip", content: "fake")
    end
    assert_match ".docx", error.message
  end

  test "没有扩展名也报不支持" do
    assert_raises(DocumentTextExtractor::UnsupportedFormat) do
      extract("noext", content: "hello")
    end
  end

  test "超过大小上限报错" do
    oversized = "x" * (DocumentTextExtractor::MAX_BYTES + 1)
    error = assert_raises(DocumentTextExtractor::ParseError) do
      extract("big.txt", content: oversized)
    end
    assert_match "文件太大", error.message
  end

  test "空文件报读不到内容" do
    error = assert_raises(DocumentTextExtractor::ParseError) do
      extract("empty.txt", content: "   \n\n  ")
    end
    assert_match "没能从文件里读到文字", error.message
  end

  test "文件损坏时报解析失败而不是崩溃" do
    error = assert_raises(DocumentTextExtractor::ParseError) do
      extract("broken.docx", content: "this is not a zip")
    end
    assert_match "解析失败", error.message
  end

  test "没有文件时报错" do
    error = assert_raises(DocumentTextExtractor::ParseError) do
      DocumentTextExtractor.new.call(nil)
    end
    assert_match "没有选择文件", error.message
  end

  test "超长内容被截断到上限" do
    long = "姓名：张三。" * 8000
    text = extract("long.txt", content: long)
    assert_equal DocumentTextExtractor::MAX_CHARS, text.length
  end

  test "归一化空白：合并多余空格和空行" do
    text = extract("messy.txt", content: "姓名：李四\r\n\n\n\n职位：\t\t工程师   ")
    assert_equal "姓名：李四\n\n职位： 工程师", text
  end
end
