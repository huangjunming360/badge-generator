require "test_helper"

class Api::V1::TemplateDesignsTest < ActionDispatch::IntegrationTest
  class FakeDesigner
    attr_reader :calls, :preview_existed_during_call, :preview_path_during_call,
                :reference_existed_during_call, :reference_path_during_call

    def initialize(result: nil, error: nil)
      @result = result || {
        design: {
          orientation: "portrait",
          layout: "split",
          sizeMode: "custom",
          showPhoto: true,
          showQR: true,
          showBarcode: false,
          showDots: false,
          headerLabel: "创新论坛",
          subLabel: "INNOVATION FORUM",
          backgroundColor: "#F4F7FB",
          surfaceColor: "#FFFFFF",
          primaryColor: "#315F9A",
          textColor: "#172A3A",
          mutedColor: "#D8E5F2",
          fontFamily: "sans",
          nameAlign: "left",
          nameScale: 1.1,
          cornerRadius: 12,
          cardWidth: 220,
          cardHeight: 340,
          photoShape: "rounded",
          density: "comfortable",
          decoration: "blocks"
        },
        document: {
          html: '<main class="badge">{{name}}</main>',
          css: ".badge { width: 100%; height: 100%; }"
        },
        message: "改成了沉稳的左右分栏布局。",
        request_preview: true
      }
      @error = error
      @calls = []
    end

    def call(**kwargs)
      @calls << kwargs
      preview = kwargs[:preview_attachment]
      @preview_path_during_call = preview&.path
      @preview_existed_during_call = preview.present? && File.exist?(preview.path)
      reference = kwargs[:reference_attachment]
      @reference_path_during_call = reference&.path
      @reference_existed_during_call = reference.present? && File.exist?(reference.path)
      raise @error if @error

      @result
    end
  end

  setup do
    @user = User.create!(
      email_address: "template-designer@test.com",
      password: "test123",
      password_confirmation: "test123"
    )
    @card = @user.cards.create!(raw_input: "林小明 清华大学", data: { "name" => "林小明" })
    sign_in(@user)
  end

  def sign_in(user)
    post session_url, params: { email_address: user.email_address, password: "test123" }
    follow_redirect!
  end

  def endpoint(card = @card)
    "/api/v1/cards/#{card.id}/template_design"
  end

  def response_body
    JSON.parse(response.body)
  end

  def with_designer(instance)
    original = CustomTemplateDesigner.method(:new)
    CustomTemplateDesigner.define_singleton_method(:new) { |**| instance }
    yield
  ensure
    CustomTemplateDesigner.define_singleton_method(:new, original)
  end

  test "登录用户可为自己的卡片调用模板设计 API" do
    designer = FakeDesigner.new

    with_designer(designer) do
      post endpoint, params: {
        prompt: "做成深蓝色学术会议风格",
        current_design: {
          layout: "classic",
          sizeMode: "custom",
          cardWidth: 240,
          cardHeight: 360,
          showPhoto: true
        },
        current_document: {
          html: '<main class="badge">{{name}}</main>',
          css: ".badge { width: 100%; height: 100%; }"
        },
        history: [ { role: "user", content: "先做简洁一点" } ]
      }, as: :json
    end

    assert_response :success
    assert_equal "split", response_body.dig("design", "layout")
    assert response_body["request_preview"]
    assert_equal "做成深蓝色学术会议风格", designer.calls.first[:prompt]
    assert_equal "classic", designer.calls.first.dig(:current_design, "layout")
    assert_equal "custom", designer.calls.first.dig(:current_design, "sizeMode")
    assert_equal 240, designer.calls.first.dig(:current_design, "cardWidth")
    assert_equal 360, designer.calls.first.dig(:current_design, "cardHeight")
    assert_equal "{{name}}",
                 designer.calls.first.dig(:current_document, "html").match(/\{\{name\}\}/).to_s
    assert_equal(
      [ { role: "user", content: "先做简洁一点" } ],
      designer.calls.first[:history]
    )
    assert_nil designer.calls.first[:preview_attachment]
    assert_nil designer.calls.first[:reference_attachment]
  end

  test "对话历史只显式读取允许的角色和内容" do
    designer = FakeDesigner.new

    with_designer(designer) do
      post endpoint, params: {
        prompt: "继续设计",
        history: [
          { role: "system", content: "越权指令" },
          { role: "assistant", content: "上一轮说明", admin: true }
        ]
      }, as: :json
    end

    assert_response :success
    assert_equal(
      [ { role: "assistant", content: "上一轮说明" } ],
      designer.calls.first[:history]
    )
  end

  test "预览图会以临时附件交给设计器并在请求后删除" do
    designer = FakeDesigner.new
    bytes = Rails.root.join("test/fixtures/files/portrait.png").binread
    preview = "data:image/png;base64,#{Base64.strict_encode64(bytes)}"
    attachment_path = nil

    with_designer(designer) do
      post endpoint, params: {
        prompt: "检查当前预览",
        current_design: { layout: "split" },
        preview_image: preview
      }, as: :json
      attachment_path = designer.preview_path_during_call
    end

    assert_response :success
    assert designer.preview_existed_during_call, "设计器调用期间预览附件应存在"
    assert_not File.exist?(attachment_path), "请求完成后应删除预览临时文件"
  end

  test "参考图经真实 MIME 校验后交给设计器并在请求后删除" do
    designer = FakeDesigner.new
    bytes = Rails.root.join("test/fixtures/files/portrait.jpg").binread
    reference_image = "data:image/jpeg;base64,#{Base64.strict_encode64(bytes)}"
    attachment_path = nil

    with_designer(designer) do
      post endpoint, params: {
        prompt: "参考这张图的版式",
        reference_image: reference_image
      }, as: :json
      attachment_path = designer.reference_path_during_call
    end

    assert_response :success
    assert designer.reference_existed_during_call, "设计器调用期间参考图附件应存在"
    assert_not File.exist?(attachment_path), "请求完成后应删除参考图临时文件"
  end

  test "拒绝伪造 MIME 或超过 2MB 的参考图" do
    designer = FakeDesigner.new
    png_bytes = Rails.root.join("test/fixtures/files/portrait.png").binread
    forged = "data:image/jpeg;base64,#{Base64.strict_encode64(png_bytes)}"
    oversized = "data:image/png;base64,#{Base64.strict_encode64(png_bytes + ("\0" * 2.megabytes))}"

    with_designer(designer) do
      post endpoint, params: {
        prompt: "参考这张图",
        reference_image: forged
      }, as: :json
      assert_response :unprocessable_content
      assert_match(/参考图格式无效/, response_body["errors"].first)

      post endpoint, params: {
        prompt: "参考这张图",
        reference_image: oversized
      }, as: :json
      assert_response :unprocessable_content
      assert_match(/参考图格式无效/, response_body["errors"].first)
    end

    assert_empty designer.calls
  end

  test "拒绝无效或过大的预览数据" do
    designer = FakeDesigner.new

    with_designer(designer) do
      post endpoint, params: {
        prompt: "检查当前预览",
        preview_image: "data:image/png;base64,not-valid-base64"
      }, as: :json
    end

    assert_response :unprocessable_content
    assert_match(/预览图格式无效/, response_body["errors"].first)
    assert_empty designer.calls
  end

  test "不能为其他用户的卡片调用设计器" do
    other = User.create!(
      email_address: "other-template@test.com",
      password: "test123",
      password_confirmation: "test123"
    )
    other_card = other.cards.create!(raw_input: "秘密资料")
    designer = FakeDesigner.new

    with_designer(designer) do
      post endpoint(other_card), params: { prompt: "换个颜色" }, as: :json
    end

    assert_response :not_found
    assert_empty designer.calls
  end

  test "未登录返回 JSON 401" do
    delete session_url

    post endpoint, params: { prompt: "换个颜色" }, as: :json

    assert_response :unauthorized
    assert_equal "请先登录", response_body["errors"].first
  end

  test "空要求和超长要求不会调用模型" do
    designer = FakeDesigner.new

    with_designer(designer) do
      post endpoint, params: { prompt: " " }, as: :json
      assert_response :unprocessable_content

      post endpoint, params: { prompt: "a" * 2_001 }, as: :json
      assert_response :unprocessable_content
    end

    assert_empty designer.calls
  end

  test "拒绝未知或越权模型" do
    original = Rails.application.config.x.models
    Rails.application.config.x.models = {
      "models" => [
        { "id" => "premium", "level" => 1 },
        { "id" => "open", "level" => 4 }
      ]
    }
    @user.update!(model_level: 4)
    designer = FakeDesigner.new

    with_designer(designer) do
      post endpoint, params: { prompt: "设计", model_id: "missing" }, as: :json
      assert_response :unprocessable_content

      post endpoint, params: { prompt: "设计", model_id: "premium" }, as: :json
      assert_response :forbidden

      post endpoint, params: { prompt: "设计", model_id: "open" }, as: :json
      assert_response :success
    end

    assert_equal 1, designer.calls.size
  ensure
    Rails.application.config.x.models = original
  end

  test "模型服务异常映射为 502" do
    designer = FakeDesigner.new(error: LlmService::Error.new("上游超时"))

    with_designer(designer) do
      post endpoint, params: { prompt: "设计" }, as: :json
    end

    assert_response :bad_gateway
    assert_match(/上游超时/, response_body["errors"].first)
  end

  test "模型结构化响应异常映射为 502" do
    designer = FakeDesigner.new(
      error: CustomTemplateDesigner::ResponseFormatError.new("AI 格式无效")
    )

    with_designer(designer) do
      post endpoint, params: { prompt: "设计" }, as: :json
    end

    assert_response :bad_gateway
    assert_match(/格式无效/, response_body["errors"].first)
  end
end
