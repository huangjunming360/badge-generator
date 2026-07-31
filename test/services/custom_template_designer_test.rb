require "test_helper"

class CustomTemplateDesignerTest < ActiveSupport::TestCase
  class FakeClient
    attr_reader :calls, :messages

    def initialize(response)
      @responses = response.is_a?(Array) ? response.dup : [ response ]
      @calls = []
    end

    def complete(messages, **options)
      @messages = messages
      @calls << { messages: messages, options: options }
      response = @responses.shift
      @responses << response if @responses.empty?
      response
    end
  end

  def valid_design(**overrides)
    CustomTemplateDesigner::DEFAULT_DESIGN.merge(overrides.stringify_keys)
  end

  def valid_document(**overrides)
    {
      "html" => '<main class="badge">{{name}}</main>',
      "css" => ".badge { width: 100%; height: 100%; }"
    }.merge(overrides.stringify_keys)
  end

  test "返回完整且规范化的自定义模板设计" do
    response = {
      design: valid_design(
        orientation: "landscape",
        layout: "split",
        sizeMode: "custom",
        showPhoto: true,
        showQR: false,
        showBarcode: true,
        showDots: false,
        headerLabel: "  嘉 宾 证  ",
        subLabel: "VIP GUEST",
        backgroundColor: "#fefefe",
        surfaceColor: "#eef4fc",
        primaryColor: "#3a76c4",
        textColor: "#1a2c40",
        mutedColor: "#8aaabb",
        fontFamily: "display",
        nameAlign: "center",
        nameScale: 1.25,
        cornerRadius: 18,
        cardWidth: 320,
        cardHeight: 190,
        photoShape: "rounded",
        density: "airy",
        decoration: "blocks"
      ),
      document: valid_document,
      message: "采用横向分栏，让姓名成为视觉焦点。",
      request_preview: true
    }.to_json
    client = FakeClient.new("```json\n#{response}\n```")

    result = CustomTemplateDesigner.new(client: client).call(
      prompt: "做一张蓝色横版嘉宾证",
      current_design: {}
    )

    assert_equal "landscape", result.dig(:design, "orientation")
    assert_equal "split", result.dig(:design, "layout")
    assert_equal "#3A76C4", result.dig(:design, "primaryColor")
    assert_equal "嘉 宾 证", result.dig(:design, "headerLabel")
    assert_equal 1.25, result.dig(:design, "nameScale")
    assert_equal 320, result.dig(:design, "cardWidth")
    assert_equal 190, result.dig(:design, "cardHeight")
    assert_equal "{{name}}", result.dig(:document, "html").match(/\{\{name\}\}/).to_s
    assert_equal true, result[:request_preview]
    assert_equal "采用横向分栏，让姓名成为视觉焦点。", result[:message]

    request = JSON.parse(client.messages.last.fetch(:content))
    assert_equal "做一张蓝色横版嘉宾证", request["prompt"]
    assert_equal CustomTemplateDesigner::DEFAULT_DESIGN, request["current_design"]
    assert_equal "嘉 宾 证", request.dig("current_design", "headerLabel")
    assert_equal "EVENT BADGE", request.dig("current_design", "subLabel")
    assert_match(/data-canvas-width/, request["canvas_instruction"])
    assert_match(/实际渲染宽高/, request["canvas_instruction"])
    assert_equal(
      CustomTemplateDesigner::RESPONSE_SCHEMA,
      client.calls.first.dig(:options, :schema)
    )
  end

  test "HTML 根元素尺寸覆盖设计参数并同步为自定义方向" do
    client = FakeClient.new(
      {
        design: valid_design(
          orientation: "portrait",
          sizeMode: "auto",
          cardWidth: 200,
          cardHeight: 300
        ),
        document: valid_document(
          html: <<~HTML
            <main class="badge" data-canvas-width="420" data-canvas-height="240">
              {{name}}
            </main>
          HTML
        ),
        message: "按 HTML 画布尺寸调整。",
        request_preview: true
      }
    )

    result = CustomTemplateDesigner.new(client: client).call(
      prompt: "改成更宽的横版",
      current_design: {}
    )

    assert_equal "custom", result.dig(:design, "sizeMode")
    assert_equal "landscape", result.dig(:design, "orientation")
    assert_equal 420, result.dig(:design, "cardWidth")
    assert_equal 240, result.dig(:design, "cardHeight")
  end

  test "模型修改宽高时即使返回 auto 也会应用实际尺寸" do
    client = FakeClient.new(
      {
        design: valid_design(
          orientation: "portrait",
          sizeMode: "auto",
          cardWidth: 360,
          cardHeight: 220
        ),
        document: valid_document,
        message: "调整画布。",
        request_preview: true
      }
    )

    result = CustomTemplateDesigner.new(client: client).call(
      prompt: "加宽一些",
      current_design: {}
    )

    assert_equal "custom", result.dig(:design, "sizeMode")
    assert_equal "landscape", result.dig(:design, "orientation")
    assert_equal 360, result.dig(:design, "cardWidth")
    assert_equal 220, result.dig(:design, "cardHeight")
  end

  test "纯文字响应会按严格 schema 自动修复一次" do
    valid = {
      design: valid_design,
      document: valid_document,
      message: "已完成视觉复审并修复排版。",
      request_preview: false
    }.to_json
    client = FakeClient.new([
      "视觉复审发现姓名与信息区域间距不足。",
      valid
    ])

    result = CustomTemplateDesigner.new(client: client).call(
      prompt: "检查排版",
      current_design: {}
    )

    assert_equal 2, client.calls.length
    repair_request = JSON.parse(client.calls.last.dig(:messages, -1, :content))
    assert_equal "format_repair", repair_request["phase"]
    assert_match(/格式错误/, repair_request["reason"])
    assert_equal "classic", result.dig(:design, "layout")
    assert_equal "已完成视觉复审并修复排版。", result[:message]
  end

  test "原生 Hash 结构化响应可直接通过" do
    client = FakeClient.new(
      {
        design: valid_design(layout: "editorial"),
        document: valid_document,
        message: "已完成。",
        request_preview: true
      }
    )

    result = CustomTemplateDesigner.new(client: client).call(
      prompt: "做成杂志风",
      current_design: {}
    )

    assert_equal 1, client.calls.length
    assert_equal "editorial", result.dig(:design, "layout")
  end

  test "视觉复审连续两次格式错误时保留上一版" do
    current = {
      layout: "split",
      primaryColor: "#123456"
    }
    current_document = valid_document
    client = FakeClient.new("视觉复审发现问题，但没有返回 JSON。")

    result = CustomTemplateDesigner.new(client: client).call(
      prompt: "检查排版",
      current_design: current,
      current_document: current_document,
      preview_attachment: Pathname.new("/tmp/custom-template-preview.png")
    )

    assert_equal 2, client.calls.length
    assert_equal "split", result.dig(:design, "layout")
    assert_equal "#123456", result.dig(:design, "primaryColor")
    assert_equal current_document, result[:document]
    assert_match(/保留上一版/, result[:message])
    assert_equal true, result[:request_preview]
  end

  test "非法当前设计会回落、夹取数值并截断文字" do
    current = {
      orientation: "landscape",
      layout: "centered",
      sizeMode: "custom",
      showPhoto: false,
      primaryColor: "#112233",
      fontFamily: "serif",
      nameScale: 99,
      cornerRadius: -5,
      cardWidth: 999,
      cardHeight: 10,
      headerLabel: "标" * 60
    }
    response = {
      design: valid_design(
        orientation: "landscape",
        layout: "centered",
        sizeMode: "custom",
        showPhoto: false,
        primaryColor: "#112233",
        fontFamily: "serif",
        cardWidth: 320,
        cardHeight: 190
      ),
      document: valid_document,
      message: "",
      request_preview: false
    }.to_json
    client = FakeClient.new(response)

    CustomTemplateDesigner.new(client: client).call(
      prompt: "更醒目",
      current_design: current
    )
    request = JSON.parse(client.calls.first.dig(:messages, -1, :content))
    design = request.fetch("current_design")

    assert_equal "landscape", design["orientation"]
    assert_equal "centered", design["layout"]
    assert_equal false, design["showPhoto"]
    assert_equal "#112233", design["primaryColor"]
    assert_equal "serif", design["fontFamily"]
    assert_equal 1.4, design["nameScale"]
    assert_equal 0, design["cornerRadius"]
    assert_equal 480, design["cardWidth"]
    assert_equal 140, design["cardHeight"]
    assert_equal 30, design["headerLabel"].length
  end

  test "畸形或夹带未知字段的响应抛出专用错误" do
    malformed_client = FakeClient.new("not json")
    malformed = CustomTemplateDesigner.new(client: malformed_client)
    assert_raises(CustomTemplateDesigner::ResponseFormatError) do
      malformed.call(prompt: "设计", current_design: {})
    end
    assert_equal 2, malformed_client.calls.length

    malicious = {
      design: valid_design(source_html: "<script>alert(1)</script>"),
      document: valid_document,
      message: "x",
      request_preview: false
    }.to_json
    malicious_client = FakeClient.new(malicious)
    error = assert_raises(CustomTemplateDesigner::ResponseFormatError) do
      CustomTemplateDesigner.new(client: malicious_client).call(
        prompt: "设计",
        current_design: {}
      )
    end
    assert_match(/连续两次/, error.message)
    assert_equal 2, malicious_client.calls.length
  end

  test "缺字段、非法枚举和非法颜色都会触发格式修复" do
    invalid_designs = [
      valid_design.except("layout"),
      valid_design(layout: "freeform"),
      valid_design(primaryColor: "blue")
    ]

    invalid_designs.each do |invalid_design|
      client = FakeClient.new([
        {
          design: invalid_design,
          document: valid_document,
          message: "无效",
          request_preview: true
        },
        {
          design: valid_design,
          document: valid_document,
          message: "已修复",
          request_preview: true
        }
      ])

      result = CustomTemplateDesigner.new(client: client).call(
        prompt: "设计",
        current_design: {}
      )

      assert_equal 2, client.calls.length
      assert_equal "classic", result.dig(:design, "layout")
      assert_equal(
        CustomTemplateDesigner::RESPONSE_SCHEMA,
        client.calls.last.dig(:options, :schema)
      )
    end
  end

  test "只传最后八条历史并单独标注预览附件" do
    history = 10.times.map do |index|
      {
        role: index.even? ? "user" : "assistant",
        content: "#{index}-#{"很长" * 1_500}"
      }
    end
    preview = Pathname.new("/tmp/custom-template-preview.png")
    response = {
      design: valid_design,
      document: valid_document,
      message: "继续检查预览",
      request_preview: false
    }.to_json
    client = FakeClient.new(response)

    CustomTemplateDesigner.new(client: client).call(
      prompt: "根据预览继续调整",
      current_design: {},
      history: history,
      preview_attachment: preview
    )

    assert_equal 10, client.messages.length
    assert client.messages.first.fetch(:content).start_with?("2-")
    assert_equal CustomTemplateDesigner::MAX_HISTORY_CONTENT_LENGTH,
                 client.messages.first.fetch(:content).length
    preview_message = client.messages[-2]
    assert_equal [ preview ], preview_message.fetch(:attachments)
    assert_match(/RENDER_PREVIEW/, preview_message.fetch(:content))
    assert_match(/头像.*不是参考图/m, preview_message.fetch(:content))
    assert_equal "user", preview_message.fetch(:role)
    request = JSON.parse(client.messages.last.fetch(:content))
    assert_equal "render_preview", request["phase"]
    assert_match(/裁切/, request["review_instruction"])
    assert_match(/长文本可读性/, request["review_instruction"])
    assert_match(/头像只是资料内容/, request["review_instruction"])
  end

  test "参考图不会把生成阶段误判为预览复审" do
    reference = Pathname.new("/tmp/custom-template-reference.png")
    response = {
      design: valid_design,
      document: valid_document,
      message: "已参考图片风格完成设计",
      request_preview: true
    }.to_json
    client = FakeClient.new(response)

    CustomTemplateDesigner.new(client: client).call(
      prompt: "参考这张图设计",
      current_design: {},
      reference_attachment: reference
    )

    request = JSON.parse(client.messages.last.fetch(:content))
    assert_equal "generate", request["phase"]
    assert_equal [ "reference_image" ], request["attachment_roles"]
    assert_match(/只参考.*REFERENCE_IMAGE/, request["reference_instruction"])
    reference_message = client.messages[-2]
    assert_equal [ reference ], reference_message.fetch(:attachments)
    assert_match(/REFERENCE_IMAGE/, reference_message.fetch(:content))
    assert_match(/参考图/, reference_message.fetch(:content))
  end

  test "参考图与自动预览可同时按明确顺序发送" do
    reference = Pathname.new("/tmp/custom-template-reference.png")
    preview = Pathname.new("/tmp/custom-template-preview.png")
    response = {
      design: valid_design,
      document: valid_document,
      message: "已结合参考图复审",
      request_preview: false
    }.to_json
    client = FakeClient.new(response)

    CustomTemplateDesigner.new(client: client).call(
      prompt: "继续调整",
      current_design: {},
      preview_attachment: preview,
      reference_attachment: reference
    )

    request = JSON.parse(client.messages.last.fetch(:content))
    assert_equal "render_preview", request["phase"]
    assert_equal %w[reference_image render_preview], request["attachment_roles"]
    reference_message = client.messages[-3]
    preview_message = client.messages[-2]
    assert_equal [ reference ], reference_message.fetch(:attachments)
    assert_equal [ preview ], preview_message.fetch(:attachments)
    assert_match(/REFERENCE_IMAGE/, reference_message.fetch(:content))
    assert_match(/RENDER_PREVIEW/, preview_message.fetch(:content))
    assert_match(/头像.*禁止模仿/m, preview_message.fetch(:content))
    assert request.key?("reference_instruction")
    assert request.key?("review_instruction")
  end

  test "未注入客户端时按用途名和模型 id 创建 LlmService" do
    client = FakeClient.new({
      design: valid_design,
      document: valid_document,
      message: "",
      request_preview: false
    }.to_json)
    arguments = nil
    original = LlmService.method(:new)
    LlmService.define_singleton_method(:new) do |**kwargs|
      arguments = kwargs
      client
    end

    CustomTemplateDesigner.new(model_id: "designer-model").call(
      prompt: "设计",
      current_design: {}
    )

    assert_equal(
      { function: :custom_template_design, model_id: "designer-model" },
      arguments
    )
  ensure
    LlmService.define_singleton_method(:new, original) if original
  end
end
