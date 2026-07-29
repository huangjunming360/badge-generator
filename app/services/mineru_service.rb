# frozen_string_literal: true

class MineruService
  class Error < StandardError; end
  class TimeoutError < Error; end

  PRECISION_BASE = "https://mineru.net"
  AGENT_BASE = "https://mineru.net/api/v1/agent"
  TIMEOUT = 300
  POLL_INTERVAL = 3

  def initialize(model_version: nil, token: nil)
    @model_version = model_version || ENV.fetch("MINERU_MODEL", "pipeline")
    @token = token || Setting.get("mineru_api_key").presence || ENV["MINERU_API_KEY"]
  end

  def parse(file_path, file_name: nil)
    raise Error, "文件不存在: #{file_path}" unless File.exist?(file_path)

    if @token.present?
      parse_precision(file_path, file_name)
    else
      parse_agent(file_path, file_name)
    end
  end

  private

  # ===== 精准 API =====
  def parse_precision(file_path, file_name)
    batch_id = upload_and_submit(file_path, file_name)
    result = poll_batch(batch_id)
    extract_result(result)
  end

  def upload_and_submit(file_path, file_name)
    resp = http_post("#{PRECISION_BASE}/api/v4/file-urls/batch",
      {
        files: [ { name: file_name || File.basename(file_path) } ],
        model_version: @model_version
      },
      headers: auth_header
    )
    data = resp["data"]
    batch_id = data["batch_id"]
    upload_url = data["file_urls"]&.first
    raise Error, "未获取到上传链接" unless upload_url
    put_file(upload_url, file_path)
    batch_id
  end

  def poll_batch(batch_id)
    elapsed = 0
    loop do
      resp = http_get("#{PRECISION_BASE}/api/v4/extract-results/batch/#{batch_id}", headers: auth_header)
      results = resp.dig("data", "extract_result") || []
      result = results.first

      case result&.[]("state")
      when "done" then return result
      when "failed" then raise Error, "MinerU 解析失败: #{result['err_msg']}"
      when "pending", "running", "converting", "waiting-file", "uploading"
        sleep POLL_INTERVAL
        elapsed += POLL_INTERVAL
        raise TimeoutError, "MinerU 解析超时" if elapsed >= TIMEOUT
      else
        raise Error, "MinerU 未知状态: #{result&.[]("state").inspect}"
      end
    end
  end

  def extract_result(result)
    zip_url = result["full_zip_url"]
    return { text: "", images: [] } unless zip_url

    text, images = process_zip(zip_url)
    { text: text, images: images, file_name: result["file_name"] }
  end

  def process_zip(zip_url)
    zip_data = download_file(zip_url)
    images = []
    markdown = nil
    bbox_map = {}   # filename => bbox

    Zip::File.open_buffer(zip_data) do |zip|
      md_entry = zip.glob("**/full.md").first || zip.glob("**/*.md").first
      markdown = md_entry.get_input_stream.read if md_entry

      # Extract bbox info from layout.json
      %w[layout.json middle.json].each do |name|
        entry = zip.glob("**/#{name}").first
        next unless entry
        begin
          extract_image_refs(JSON.parse(entry.get_input_stream.read), bbox_map)
          break
        rescue JSON::ParserError
          nil
        end
      end

      # Directly read images from ZIP entries
      zip.each do |entry|
        next unless entry.name.match?(/\.(png|jpg|jpeg|webp)$/i)
        data = entry.get_input_stream.read
        data = data.is_a?(StringIO) ? data.string : data
        next if data.nil? || data.bytesize < 512
        images << {
          path: File.basename(entry.name),
          data: data,
          bbox: bbox_map[File.basename(entry.name)]
        }
      end
    end

    [ markdown || "", images ]
  end

  def extract_image_refs(layout, bbox_map)
    pdf_infos = layout["pdf_info"] || []
    pdf_infos.each do |info|
      blocks = info["preproc_blocks"] || []
      blocks.each do |block|
        next unless block["type"] == "image"
        bbox = block["bbox"]
        (block["blocks"] || []).each do |sb|
          (sb["lines"] || []).each do |line|
            (line["spans"] || []).each do |span|
              next unless span["type"] == "image" && span["image_path"]
              bbox_map[File.basename(span["image_path"])] = span["bbox"] || sb["bbox"] || bbox
            end
          end
        end
      end
    end
  end

  def zip_entry_data(zip_data, path)
    Zip::File.open_buffer(zip_data) do |zip|
      entry = zip.find { |e| e.name == path || e.name.end_with?("/#{path}") }
      data = entry ? entry.get_input_stream.read : nil
      data = data.is_a?(StringIO) ? data.string : data if data
      data
    end
  end

  # ===== Agent 轻量 API =====
  def parse_agent(file_path, file_name)
    name = file_name || File.basename(file_path)
    resp = http_post("#{AGENT_BASE}/parse/file", { file_name: name })
    data = resp["data"]
    task_id = data["task_id"]
    upload_url = data["file_url"]
    raise Error, "未获取到上传链接" unless upload_url
    put_file(upload_url, file_path)
    markdown_url = poll_agent(task_id)
    text = download_text(markdown_url)
    { text: text, images: [] }
  end

  def poll_agent(task_id)
    elapsed = 0
    loop do
      resp = http_get("#{AGENT_BASE}/parse/#{task_id}")
      data = resp["data"]
      case data&.[]("state")
      when "done" then return data["markdown_url"]
      when "failed" then raise Error, "MinerU Agent 解析失败: #{data['err_msg']}"
      when "waiting-file", "pending", "running", "uploading"
        sleep POLL_INTERVAL
        elapsed += POLL_INTERVAL
        raise TimeoutError, "MinerU Agent 解析超时" if elapsed >= TIMEOUT
      else
        raise Error, "MinerU Agent 未知状态: #{data&.[]("state").inspect}"
      end
    end
  end

  # ===== HTTP =====
  def auth_header
    { "Authorization" => "Bearer #{@token}" }
  end

  def http_post(url, body, headers: {})
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 30
    req = Net::HTTP::Post.new(uri)
    req["Content-Type"] = "application/json"
    headers.each { |k, v| req[k] = v }
    req.body = body.to_json
    parse_response(http.request(req))
  end

  def http_get(url, headers: {})
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 30
    req = Net::HTTP::Get.new(uri)
    headers.each { |k, v| req[k] = v }
    parse_response(http.request(req))
  end

  def put_file(url, file_path)
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 120
    http.open_timeout = 30
    req = Net::HTTP::Put.new(uri)
    req["Content-Length"] = File.size(file_path)
    res = File.open(file_path, "rb") do |io|
      req.body_stream = io
      http.request(req)
    end
    unless res.code.to_i >= 200 && res.code.to_i < 300
      raise Error, "上传失败: HTTP #{res.code}"
    end
  end

  def download_file(url)
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 120
    http.open_timeout = 30
    if http.use_ssl?
      http.verify_mode = OpenSSL::SSL::VERIFY_PEER
      cert_store = OpenSSL::X509::Store.new
      cert_store.set_default_paths
      http.cert_store = cert_store
    end
    res = http.request(Net::HTTP::Get.new(uri))
    raise Error, "下载失败: HTTP #{res.code}" unless res.code.to_i >= 200 && res.code.to_i < 300
    res.body
  rescue OpenSSL::SSL::SSLError => e
    raise Error, "SSL 验证失败: #{e.message}"
  end

  def download_text(url)
    download_file(url).force_encoding("UTF-8")
  rescue => e
    raise Error, "下载结果失败: #{e.message}"
  end

  def parse_response(res)
    body = JSON.parse(res.body)
    code = body["code"]
    return body if code == 0 || code.nil?
    raise Error, "MinerU API 错误 (#{code}): #{body['msg']}"
  rescue JSON::ParserError
    raise Error, "MinerU 返回非 JSON: #{res.code}"
  end
end
