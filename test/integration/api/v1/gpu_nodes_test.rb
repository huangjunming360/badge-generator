require "test_helper"

class Api::V1::GpuNodesTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "gpu-node-admin@test.com", password: "test123", password_confirmation: "test123", role: "admin")
    @user = User.create!(email_address: "gpu-node-user@test.com", password: "test123", password_confirmation: "test123")
    @original_models = Rails.application.config.x.models
    Rails.application.config.x.models = {
      "default" => "agent-haiku",
      "models" => [
        { "id" => "agent-haiku", "label" => "Haiku", "api" => "anthropic", "model" => "claude-haiku-test", "api_base" => "https://anthropic.example.test" },
        { "id" => "openai", "label" => "OpenAI", "api" => "openai", "model" => "gpt-test", "api_base" => "https://openai.example.test" }
      ]
    }
  end

  teardown do
    Rails.application.config.x.models = @original_models
  end

  def sign_in(user)
    post session_url, params: { email_address: user.email_address, password: "test123" }
    follow_redirect!
  end

  def body
    JSON.parse(response.body)
  end

  def node_params(name: "家庭 4090", server_url: "http://10.147.0.8:8000")
    { gpu_node: { name: name, server_url: server_url } }
  end

  test "只有管理员可以查看全局节点" do
    sign_in(@user)

    get "/api/v1/admin/gpu_nodes"

    assert_response :forbidden
  end

  test "管理员创建节点只返回一次明文凭据且数据库只保存摘要" do
    sign_in(@admin)

    post "/api/v1/admin/gpu_nodes", params: node_params

    assert_response :created
    assert_equal "no-store", response.headers["Cache-Control"]
    token = body.dig("credentials", "token")
    node = GpuNode.find(body.dig("node", "id"))
    assert_match(/\Anode-[a-f0-9]{12}\z/, node.node_key)
    assert_equal node.node_key, body.dig("credentials", "node_id")
    assert_equal "http://10.147.0.8:8000", body.dig("credentials", "environment", "TEMPLATE_AGENT_SERVER_URL")
    assert node.authenticate_token(token)
    assert_not_equal token, node.token_digest
    assert_equal 1, body.dig("node", "desired_config", "max_concurrency")

    get "/api/v1/admin/gpu_nodes"

    assert_response :success
    assert_not_includes response.body, token
    assert_not_includes response.body, "token_digest"
  end

  test "管理员可以暂停节点并设置有限轮数" do
    node = GpuNode.create!(node_key: "node-control", name: "控制节点", token: "old-token")
    sign_in(@admin)

    patch "/api/v1/admin/gpu_nodes/#{node.id}/update_config", params: {
      gpu_node: { paused: true, max_iterations: 99, max_concurrency: 20, claude_model_id: "agent-haiku" }
    }

    assert_response :success
    assert_equal true, body.dig("node", "desired_config", "paused")
    assert_equal 99, body.dig("node", "desired_config", "max_iterations")
    assert_equal 1, body.dig("node", "desired_config", "max_concurrency")
    assert_equal "agent-haiku", body.dig("node", "desired_config", "claude_model_id")
    assert_equal "claude-haiku-test", body.dig("node", "desired_config", "claude_model")
    assert_equal "https://anthropic.example.test", body.dig("node", "desired_config", "claude_base_url")
    assert_equal true, node.reload.effective_desired_config.fetch("paused")

    get "/api/v1/admin/gpu_nodes"
    assert_equal [ "agent-haiku" ], body.fetch("agent_models").map { |model| model.fetch("id") }
  end

  test "只允许下发后台配置的 Anthropic 模型" do
    node = GpuNode.create!(node_key: "node-model", name: "模型节点", token: "old-token")
    sign_in(@admin)

    patch "/api/v1/admin/gpu_nodes/#{node.id}/update_config", params: {
      gpu_node: { claude_model_id: "openai" }
    }

    assert_response :bad_request
    assert_nil node.reload.effective_desired_config.fetch("claude_model")
  end

  test "轮换和撤销令牌不会泄露旧凭据并会释放租约" do
    node = GpuNode.create!(node_key: "node-revoke", name: "可撤销节点", token: "old-token")
    job = @admin.template_generation_jobs.create!(
      job_type: "visual_repair",
      payload: { "source_html" => "<h1>{{ card.name }}</h1>", "source_css" => "h1 { color: #123456; }" }
    )
    job.update!(
      status: "leased",
      gpu_node: node,
      lease_token_digest: BCrypt::Password.create("lease-token"),
      lease_expires_at: 5.minutes.from_now
    )
    sign_in(@admin)

    post "/api/v1/admin/gpu_nodes/#{node.id}/rotate_token", params: node_params(server_url: "https://zt.example.test")

    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    rotated = body.dig("credentials", "token")
    assert_not_equal "old-token", rotated
    assert_not node.reload.authenticate_token("old-token")
    assert node.authenticate_token(rotated)

    post "/api/v1/admin/gpu_nodes/#{node.id}/revoke"

    assert_response :success
    assert_equal 1, body.fetch("released_jobs")
    assert_equal false, node.reload.active?
    assert_equal "queued", job.reload.status
    assert_nil job.gpu_node_id
    assert_nil job.lease_token_digest
    assert_nil job.lease_expires_at
  end

  test "无效控制面地址不会创建节点" do
    sign_in(@admin)

    assert_no_difference "GpuNode.count" do
      post "/api/v1/admin/gpu_nodes", params: node_params(server_url: "file:///tmp/not-a-control-plane")
    end

    assert_response :bad_request
    assert_equal [ "param is missing or the value is empty or invalid: gpu_node.server_url（必须为 http 或 https URL）" ], body["errors"]
  end
end
