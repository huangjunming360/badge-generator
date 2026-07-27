require "net/http"
require "json"

# Anthropic Messages API 的最小流式客户端。
# 端点/密钥从 Rails.application.config.x.llm 读（见 config/initializers/llm.rb）。
class AnthropicClient
  class Error < StandardError; end

  SYSTEM_PROMPT = "你是一个乐于助人的中文助手。回答简洁、准确，使用简体中文。"

  def initialize(config: Rails.application.config.x.llm)
    @config = config
    raise Error, "缺少 API key，请在 .env 设置 LLM_API_KEY" if @config[:api_key].blank?
  end

  # 流式请求。每收到一个文本增量就 yield 一次。
  # 返回拼接后的完整文本。
  def stream(messages, &block)
    uri = URI.join(@config[:base_url].chomp("/") + "/", "v1/messages")
    body = {
      model: @config[:model],
      max_tokens: @config[:max_tokens],
      stream: true,
      system: SYSTEM_PROMPT,
      messages: messages
    }

    full = +""
    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                    read_timeout: @config[:timeout]) do |http|
      request = Net::HTTP::Post.new(uri)
      request["x-api-key"] = @config[:api_key]
      request["anthropic-version"] = "2023-06-01"
      request["content-type"] = "application/json"
      request["accept"] = "text/event-stream"
      request.body = JSON.generate(body)

      http.request(request) do |response|
        unless response.code.to_i == 200
          raise Error, "上游返回 #{response.code}: #{response.read_body.to_s[0, 500]}"
        end

        buffer = +""
        response.read_body do |chunk|
          buffer << chunk
          # SSE 事件之间用空行分隔；只处理已完整到达的部分。
          while (idx = buffer.index("\n\n"))
            event = buffer.slice!(0, idx + 2)
            text = extract_delta(event)
            next if text.nil? || text.empty?
            full << text
            block&.call(text)
          end
        end
      end
    end
    full
  end

  private

  # 从一个 SSE 事件块里取出 content_block_delta 的文本增量。
  def extract_delta(event)
    line = event.lines.find { |l| l.start_with?("data:") }
    return nil unless line

    payload = JSON.parse(line.sub(/\Adata:\s*/, ""))
    return nil unless payload["type"] == "content_block_delta"
    payload.dig("delta", "text")
  rescue JSON::ParserError
    nil
  end
end
