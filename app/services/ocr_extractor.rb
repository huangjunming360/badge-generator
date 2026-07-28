require "open3"
require "tmpdir"

# 扫描版 PDF 和图片的文字识别，基于 tesseract。
# 只在 pdf-reader 取不到文字层时作为兜底调用。
class OcrExtractor
  class OcrError < StandardError; end

  # 识别语言：中文简体 + 英文。中英混排的名片资料很常见。
  LANGUAGES = "chi_sim+eng".freeze
  # 扫描页转图的分辨率。300dpi 是 OCR 的常规下限，再高收益不大但明显更慢。
  DPI = 300
  # 最多识别几页。个人资料通常一两页，防止误传大文档时卡死。
  MAX_PAGES = 5
  TIMEOUT_SECONDS = 120

  IMAGE_EXTENSIONS = %w[.png .jpg .jpeg .tif .tiff .bmp].freeze

  def available?
    self.class.available?
  end

  def self.available?
    @available = system("which tesseract > /dev/null 2>&1") if @available.nil?
    @available
  end

  # 扫描版 PDF：先转成图片再逐页识别。
  def from_pdf(path)
    ensure_available!

    Dir.mktmpdir do |dir|
      prefix = File.join(dir, "page")
      run!("pdftoppm", "-r", DPI.to_s, "-l", MAX_PAGES.to_s, "-png", path, prefix)

      pages = Dir.glob("#{prefix}*.png").sort
      raise OcrError, "PDF 没能转成图片" if pages.empty?

      pages.map { |page| recognize(page) }.join("\n").strip
    end
  end

  # 图片直接识别。
  def from_image(path)
    ensure_available!
    recognize(path)
  end

  private

  def ensure_available!
    raise OcrError, "服务器未安装 tesseract，无法识别扫描件" unless available?
  end

  def recognize(image_path)
    # tesseract 输出到 stdout 用 "-" 作为目标。
    # psm 6 = 当作单一文本块按行读。默认的 psm 3 自动版面分析会把
    # "姓名：张三" 这类左右布局拆成两行，字段和值错位，LLM 就配不对了。
    run!("tesseract", image_path, "-", "-l", LANGUAGES, "--psm", "6")
  end

  def run!(*command)
    stdout, stderr, status = Open3.capture3(*command)
    unless status.success?
      raise OcrError, "#{command.first} 执行失败：#{stderr.to_s[0, 200]}"
    end
    stdout
  rescue Errno::ENOENT
    raise OcrError, "服务器缺少 #{command.first} 命令"
  end
end
