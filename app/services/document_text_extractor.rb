# 把上传的文档转成纯文本，交给 CardExtractor 做标准化。
# 只负责"文件 → 文本"，不碰 LLM。
class DocumentTextExtractor
  class UnsupportedFormat < StandardError; end
  class ParseError < StandardError; end

  MAX_BYTES = 10.megabytes
  # 抽出的文本上限，避免超长文档把 LLM 请求撑爆。
  MAX_CHARS = 20_000

  EXTENSIONS = {
    ".docx" => :docx,
    ".pdf" => :pdf,
    ".xlsx" => :spreadsheet,
    ".xlsm" => :spreadsheet,
    ".csv" => :spreadsheet,
    ".txt" => :plain,
    ".md" => :plain,
    ".png" => :image,
    ".jpg" => :image,
    ".jpeg" => :image,
    ".tif" => :image,
    ".tiff" => :image,
    ".bmp" => :image
  }.freeze

  # PDF 文字层短于这个长度就认为是扫描版，转走 OCR。
  # 扫描件常带一点页眉页脚文字，所以不能只判断完全为空。
  SCANNED_PDF_THRESHOLD = 20

  # 从设置读取允许的扩展名，如果没有则用内置默认
  def self.accepted_extensions
    raw = Setting.get("allowed_extensions")
    return EXTENSIONS.keys if raw.blank?
    raw.split.map(&:strip).select { |e| e.start_with?(".") }
  end

  ACCEPT_ATTRIBUTE = -> { accepted_extensions.join(",") }

  # 本次解析是否走了 OCR，供界面提示识别质量可能有偏差。
  def used_ocr?
    @used_ocr.present?
  end

  attr_reader :extracted_images

  def call(uploaded_file)
    raise ParseError, "没有选择文件" if uploaded_file.blank?

    validate_size!(uploaded_file)
    kind = detect_kind(uploaded_file.original_filename)

    # 启用 MinerU 时优先走 MinerU（PDF/图片/Office 文档）
    if mineru_enabled?
      result = try_mineru(uploaded_file)
      return result if result
    end

    text = with_tempfile(uploaded_file) do |path|
      case kind
      when :docx        then parse_docx(path)
      when :pdf         then parse_pdf(path)
      when :spreadsheet then parse_spreadsheet(path)
      when :plain       then parse_plain(path)
      when :image       then parse_image(path)
      end
    end

    cleaned = normalize_whitespace(text)
    raise ParseError, "没能从文件里读到文字内容，可能是扫描版或空文件" if cleaned.blank?

    cleaned.truncate(MAX_CHARS)
  end

  private

  def mineru_enabled?
    Setting.bool("mineru_enabled", default: false) && (Setting.get("mineru_api_key").present? || ENV["MINERU_API_KEY"].present?)
  end

  def try_mineru(uploaded_file)
    model_id = Setting.get("mineru_model", default: nil).presence
    ext = File.extname(uploaded_file.original_filename.to_s).downcase
    tmpfile = save_tempfile(uploaded_file, ext)

    result = MineruService.new(model_version: model_id).parse(tmpfile.path,
      file_name: uploaded_file.original_filename)
    @extracted_images = result[:images]
    raw = result[:text].to_s
    raw = raw.force_encoding("UTF-8") if raw.encoding == Encoding::BINARY
    text = normalize_whitespace(raw)
    return nil if text.blank?

    text.truncate(MAX_CHARS)
  rescue MineruService::Error => e
    Rails.logger.warn("MinerU 解析失败，降级到旧解析器: #{e.message}")
    nil
  ensure
    # close! 会 unlink，Windows 上文件若还被持着就抛 EACCES，
    # 会盖掉本来成功的 MinerU 结果。跟 with_tempfile 一样宽容处理。
    cleanup_tempfile(tmpfile) if tmpfile
  end

  def save_tempfile(uploaded_file, ext)
    tmp = Tempfile.new([ "mineru", ext ], binmode: true)
    uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
    IO.copy_stream(uploaded_file.to_io, tmp)
    tmp.flush
    # 关掉自己这份句柄：MineruService 只按路径读，Windows 上留着句柄
    # 会和它的 File.open 抢占。返回 Tempfile 对象本身防止 GC 删掉文件。
    tmp.close
    tmp
  end

  def validate_size!(file)
    return unless file.size > MAX_BYTES
    raise ParseError, "文件太大（上限 #{MAX_BYTES / 1.megabyte}MB）"
  end

  def detect_kind(filename)
    ext = File.extname(filename.to_s).downcase
    allowed = self.class.accepted_extensions
    raise UnsupportedFormat, "不支持 #{ext.presence || '这种'} 格式，支持：#{allowed.join(' ')}" if allowed.exclude?(ext)
    EXTENSIONS.fetch(ext) do
      raise UnsupportedFormat, "不支持 #{ext.presence || '这种'} 格式，支持：#{allowed.join(' ')}"
    end
  end

  # 解析库大多只认磁盘路径，统一落到临时文件再处理。
  #
  # 不用 Tempfile.create 的块形式：它在块结束时 unlink，而 docx 走的
  # Zip::File.open 会一直持着这个路径的句柄（rubyzip 3 的 Zip::File#close
  # 只是 commit 的别名，不释放句柄）。Windows 上删不掉仍被打开的文件，
  # unlink 抛 EACCES，正文其实已经读出来了却被报成解析失败。
  # 改成手动删，删不掉只记日志 —— 临时文件留给系统回收，
  # 不能让清理失败盖掉已经成功的解析结果。
  def with_tempfile(uploaded_file)
    ext = File.extname(uploaded_file.original_filename.to_s).downcase
    tmp = Tempfile.new([ "upload", ext ], binmode: true)
    begin
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      IO.copy_stream(uploaded_file.to_io, tmp)
      tmp.flush
      # 关掉自己这份句柄，解析库才好在 Windows 上按路径打开。
      tmp.close
      yield tmp.path
    ensure
      cleanup_tempfile(tmp)
    end
  rescue UnsupportedFormat, ParseError, OcrExtractor::OcrError
    raise
  rescue StandardError => e
    raise ParseError, "文件解析失败：#{e.message}"
  end

  # 删不掉不是错误：解析已经完成，残留的临时文件由系统的临时目录清理兜底。
  def cleanup_tempfile(tmp)
    tmp.close unless tmp.closed?
    tmp.unlink
  rescue Errno::EACCES, Errno::ENOENT => e
    Rails.logger.warn("临时文件清理失败（不影响解析结果）：#{e.message}")
  end

  def parse_docx(path)
    doc = Docx::Document.open(path)
    parts = doc.paragraphs.map(&:text)
    # 表格里常放"字段名 | 值"，逐行拼起来保留对应关系。
    doc.tables.each do |table|
      table.rows.each do |row|
        parts << row.cells.map(&:text).map(&:strip).reject(&:empty?).join("：")
      end
    end
    parts.join("\n")
  end

  # 先取文字层；取不到（扫描版）就转 OCR。
  def parse_pdf(path)
    text = begin
      PDF::Reader.new(path).pages.map(&:text).join("\n")
    rescue StandardError => e
      Rails.logger.warn("PDF 文字层读取失败，转 OCR：#{e.message}")
      ""
    end

    return text if text.strip.length >= SCANNED_PDF_THRESHOLD

    Rails.logger.info("PDF 文字层为空或过短，启用 OCR")
    @used_ocr = true
    ocr.from_pdf(path)
  end

  def parse_image(path)
    @used_ocr = true
    ocr.from_image(path)
  end

  def ocr
    @ocr ||= OcrExtractor.new
  end

  def parse_spreadsheet(path)
    sheet = Roo::Spreadsheet.open(path)
    sheet.sheets.flat_map { |name|
      sheet.sheet(name).to_a.map { |row|
        row.map { |cell| cell.to_s.strip }.reject(&:empty?).join("：")
      }
    }.reject(&:empty?).join("\n")
  end

  def parse_plain(path)
    File.read(path, encoding: "bom|utf-8")
  end

  def normalize_whitespace(text)
    text.to_s
        .gsub(/\r\n?/, "\n")
        .gsub(/[ \t ]+/, " ")
        .gsub(/\n{3,}/, "\n\n")
        .strip
  end
end
