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
    @token = token || ENV["MINERU_API_KEY"]
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
    TIMEOUT.times do
      resp = http_get("#{PRECISION_BASE}/api/v4/extract-results/batch/#{batch_id}", headers: auth_header)
      result = resp.dig("data", "extract_result")&.first
      return result if result.nil?

      case result["state"]
      when "done" then return result
      when "failed" then raise Error, "MinerU 解析失败: #{result['err_msg']}"
      when "pending", "running", "converting", "waiting-file", "uploading"
        sleep POLL_INTERVAL
      end
    end
    raise TimeoutError, "MinerU 解析超时"
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
    image_refs = []  # { url:, path:, bbox: }

    Zip::File.open_buffer(zip_data) do |zip|
      # full.md
      md_entry = zip.glob("**/full.md").first || zip.glob("**/*.md").first
      markdown = md_entry.get_input_stream.read if md_entry

      # 从布局/中间文件中提取图片引用（CDN URL + bbox）
      layout_entry = zip.glob("**/layout.json").first ||
                     zip.glob("**/middle.json").first
      if layout_entry
        begin
          layout = JSON.parse(layout_entry.get_input_stream.read)
          extract_image_refs(layout, image_refs)
        rescue JSON::ParserError
          nil
        end
      end

      # 也查 content_list.json
      cl_entry = zip.glob("**/content_list.json").first
      if cl_entry
        begin
          cl = JSON.parse(cl_entry.get_input_stream.read)
          cl.each do |item|
            next unless item["image_path"]
            next if image_refs.any? { |r| r[:path] == item["image_path"] }
            image_refs << { url: item["image_path"], path: File.basename(item["image_path"]), bbox: item["bbox"] }
          end
        rescue JSON::ParserError
          nil
        end
      end

      # ZIP 内嵌图片（如果有的话）
      zip.each do |entry|
        next unless entry.name.match?(/\.(png|jpg|jpeg|webp)$/i)
        next if image_refs.any? { |r| r[:path] == entry.name || r[:url]&.include?(entry.name) }
        image_refs << { url: nil, path: entry.name, bbox: nil }
      end
    end

    # 下载图片
    image_refs.each do |ref|
      begin
        data = if ref[:url].to_s.match?(%r{^https?://})
          download_file(ref[:url])
        else
          zip_entry_data(zip_data, ref[:path])
        end
        images << { path: ref[:path], data: data, bbox: ref[:bbox] } if data
        Rails.logger.info("MinerU img: #{ref[:path]}=#{data.class}(#{data.bytesize})")
      rescue => e
        Rails.logger.warn("MinerU 图片下载失败: #{ref[:path]}: #{e.message}")
      end
    end

    Rails.logger.info("MinerU ZIP: #{images.length} images, #{image_refs.length} refs, md=#{markdown ? markdown.length : 0}bytes")
    [ markdown || "", images ]
  end

  def extract_image_refs(layout, refs)
    # middle.json 结构: { pdf_info: [{ preproc_blocks: [...] }] }
    pdf_infos = layout["pdf_info"] || []
    pdf_infos.each do |info|
      blocks = info["preproc_blocks"] || []
      blocks.each do |block|
        next unless block["type"] == "image"
        extract_from_block(block, refs)
      end
    end
  end

  def extract_from_block(block, refs)
    bbox = block["bbox"]
    sub_blocks = block["blocks"] || []
    sub_blocks.each do |sb|
      sb["lines"]&.each do |line|
        line["spans"]&.each do |span|
          next unless span["type"] == "image" && span["image_path"]
          refs << {
            url: span["image_path"],
            path: File.basename(span["image_path"]),
            bbox: span["bbox"] || sb["bbox"] || bbox
          }
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
    TIMEOUT.times do
      resp = http_get("#{AGENT_BASE}/parse/#{task_id}")
      data = resp["data"]
      case data["state"]
      when "done" then return data["markdown_url"]
      when "failed" then raise Error, "MinerU Agent 解析失败: #{data['err_msg']}"
      when "waiting-file", "pending", "running", "uploading"
        sleep POLL_INTERVAL
      end
    end
    raise TimeoutError, "MinerU Agent 解析超时"
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
    req = Net::HTTP::Put.new(uri)
    req.body_stream = File.open(file_path, "rb")
    req["Content-Length"] = File.size(file_path)
    res = http.request(req)
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
    http.verify_mode = OpenSSL::SSL::VERIFY_PEER
    res = http.request(Net::HTTP::Get.new(uri))
    unless res.code.to_i >= 200 && res.code.to_i < 300
      raise Error, "下载失败: HTTP #{res.code}"
    end
    res.body
  rescue OpenSSL::SSL::SSLError
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    retry
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
