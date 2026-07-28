# frozen_string_literal: true

# MinerU 文档解析服务。
# 支持精准解析 API（需 Token）和 Agent 轻量 API（无需 Token）两种模式。
# 精准模式返回 ZIP（含 Markdown + JSON + 图片），
# Agent 模式仅返回 Markdown CDN 链接。
#
# 用法：
#   MineruService.new.parse(file_path, file_name: "resume.pdf")
#   # => { text: "...", images: [{ path: "...", bbox: [...] }], model_version: "pipeline" }
class MineruService
  class Error < StandardError; end
  class TimeoutError < Error; end

  PRECISION_BASE = "https://mineru.net"
  AGENT_BASE = "https://mineru.net/api/v1/agent"
  TIMEOUT = 300 # 最大等待秒数
  POLL_INTERVAL = 3

  def initialize(model_version: nil, token: nil)
    @model_version = model_version || ENV.fetch("MINERU_MODEL", "pipeline")
    @token = token || ENV["MINERU_API_KEY"]
  end

  # 解析本地文件。有 Token 走精准 API，否则走 Agent 轻量 API。
  def parse(file_path, file_name: nil)
    raise Error, "文件不存在: #{file_path}" unless File.exist?(file_path)

    if @token.present?
      parse_precision(file_path, file_name)
    else
      parse_agent(file_path, file_name)
    end
  end

  private

  # ===== 精准 API（有 Token）=====
  def parse_precision(file_path, file_name)
    batch_id = upload_and_submit(file_path, file_name)
    result = poll_batch(batch_id)
    extract_result_from_zip(result)
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

    # PUT 上传文件
    put_file(upload_url, file_path)
    batch_id
  end

  def poll_batch(batch_id)
    TIMEOUT.times do
      resp = http_get("#{PRECISION_BASE}/api/v4/extract-results/batch/#{batch_id}", headers: auth_header)
      results = resp.dig("data", "extract_result") || []
      result = results.first
      return result if result.nil?

      case result["state"]
      when "done"
        return result
      when "failed"
        raise Error, "MinerU 解析失败: #{result['err_msg']}"
      when "pending", "running", "converting", "waiting-file", "uploading"
        sleep POLL_INTERVAL
      end
    end
    raise TimeoutError, "MinerU 解析超时"
  end

  def extract_result_from_zip(result)
    zip_url = result["full_zip_url"]
    return { text: "", images: [] } unless zip_url

    text, images = process_zip(zip_url)
    { text: text, images: images, file_name: result["file_name"] }
  end

  def process_zip(zip_url)
    zip_data = download_file(zip_url)
    images = []
    markdown = nil

    Zip::File.open_buffer(zip_data) do |zip|
      # 找 full.md
      md_entry = zip.glob("**/full.md").first ||
                 zip.glob("**/*.md").first
      markdown = md_entry.get_input_stream.read if md_entry

      # 提取图片
      zip.each do |entry|
        next unless entry.name.match?(/\.(png|jpg|jpeg|webp)$/i)
        # 大型图片可能是文档内嵌图（含证件照）
        images << {
          path: entry.name,
          data: entry.get_input_stream.read
        }
      end

      # 尝试从 content_list.json 获取图片坐标信息
      cl_entry = zip.glob("**/content_list.json").first
      if cl_entry
        begin
          cl = JSON.parse(cl_entry.get_input_stream.read)
          # content_list 可能包含图片的 bbox 信息
          extract_image_metadata(cl, images)
        rescue JSON::ParserError
          # ignore
        end
      end
    end

    [ markdown || "", images ]
  end

  def extract_image_metadata(content_list, images)
    # content_list 每项含 type/image_path/bbox 等
    content_list.each do |item|
      next unless item["type"] == "image" || item["image_path"]
      img_path = item["image_path"]
      img = images.find { |i| i[:path].end_with?(File.basename(img_path || "")) }
      next unless img
      img[:bbox] = item["bbox"] if item["bbox"]
      img[:caption] = item["caption"] if item["caption"]
    end
  end

  # ===== Agent 轻量 API（无需 Token）=====
  def parse_agent(file_path, file_name)
    # Step 1: 获取上传地址
    name = file_name || File.basename(file_path)
    resp = http_post("#{AGENT_BASE}/parse/file", { file_name: name })
    data = resp["data"]
    task_id = data["task_id"]
    upload_url = data["file_url"]
    raise Error, "未获取到上传链接" unless upload_url

    # Step 2: PUT 上传
    put_file(upload_url, file_path)

    # Step 3: 轮询
    markdown_url = poll_agent(task_id)
    text = download_text(markdown_url)
    { text: text, images: [] }
  end

  def poll_agent(task_id)
    TIMEOUT.times do
      resp = http_get("#{AGENT_BASE}/parse/#{task_id}")
      data = resp["data"]
      case data["state"]
      when "done"
        return data["markdown_url"]
      when "failed"
        raise Error, "MinerU Agent 解析失败: #{data['err_msg']}"
      when "waiting-file", "pending", "running", "uploading"
        sleep POLL_INTERVAL
      end
    end
    raise TimeoutError, "MinerU Agent 解析超时"
  end

  # ===== HTTP 工具 =====
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

    res = http.request(req)
    parse_response(res)
  end

  def http_get(url, headers: {})
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 30

    req = Net::HTTP::Get.new(uri)
    headers.each { |k, v| req[k] = v }

    res = http.request(req)
    parse_response(res)
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
    unless res.code.to_i == 200
      raise Error, "上传失败: HTTP #{res.code}"
    end
  end

  def download_file(url)
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.read_timeout = 120
    http.open_timeout = 30
    # macOS 代理工具（Surge/ClashX）可能拦截连接
    http.verify_mode = OpenSSL::SSL::VERIFY_PEER

    res = http.request(Net::HTTP::Get.new(uri))
    raise Error, "下载失败: HTTP #{res.code}" unless res.code.to_i == 200
    res.body
  rescue OpenSSL::SSL::SSLError => e
    # 重试一次，跳过 SSL 验证（部分 CDN/代理环境需要）
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    retry
  end

  def download_text(url)
    data = download_file(url)
    data.force_encoding("UTF-8")
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
