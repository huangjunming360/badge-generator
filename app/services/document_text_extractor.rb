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
    ".md" => :plain
  }.freeze

  ACCEPT_ATTRIBUTE = EXTENSIONS.keys.join(",").freeze

  def call(uploaded_file)
    raise ParseError, "没有选择文件" if uploaded_file.blank?

    validate_size!(uploaded_file)
    kind = detect_kind(uploaded_file.original_filename)

    text = with_tempfile(uploaded_file) do |path|
      case kind
      when :docx        then parse_docx(path)
      when :pdf         then parse_pdf(path)
      when :spreadsheet then parse_spreadsheet(path)
      when :plain       then parse_plain(path)
      end
    end

    cleaned = normalize_whitespace(text)
    raise ParseError, "没能从文件里读到文字内容，可能是扫描版或空文件" if cleaned.blank?

    cleaned.truncate(MAX_CHARS)
  end

  private

  def validate_size!(file)
    return unless file.size > MAX_BYTES
    raise ParseError, "文件太大（上限 #{MAX_BYTES / 1.megabyte}MB）"
  end

  def detect_kind(filename)
    ext = File.extname(filename.to_s).downcase
    EXTENSIONS.fetch(ext) do
      raise UnsupportedFormat, "不支持 #{ext.presence || '这种'} 格式，支持：#{EXTENSIONS.keys.join(' ')}"
    end
  end

  # 解析库大多只认磁盘路径，统一落到临时文件再处理。
  def with_tempfile(uploaded_file)
    ext = File.extname(uploaded_file.original_filename.to_s).downcase
    Tempfile.create([ "upload", ext ], binmode: true) do |tmp|
      uploaded_file.rewind if uploaded_file.respond_to?(:rewind)
      IO.copy_stream(uploaded_file.to_io, tmp)
      tmp.flush
      yield tmp.path
    end
  rescue UnsupportedFormat, ParseError
    raise
  rescue StandardError => e
    raise ParseError, "文件解析失败：#{e.message}"
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

  def parse_pdf(path)
    PDF::Reader.new(path).pages.map(&:text).join("\n")
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
