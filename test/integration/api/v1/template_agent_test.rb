require "test_helper"

class Api::V1::TemplateAgentTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(email_address: "gpu-job-user@test.com", password: "test123", password_confirmation: "test123")
    @node = GpuNode.create!(node_key: "home-4090", name: "Home 4090", token: "node-secret")
  end

  def node_headers(token: "node-secret")
    {
      "Authorization" => "Bearer #{token}",
      "X-Template-Agent-Node" => "home-4090"
    }
  end

  def body
    JSON.parse(response.body)
  end

  def queued_job
    @user.template_generation_jobs.create!(
      job_type: "visual_repair",
      complexity: 5,
      payload: {
        "source_html" => "<h1>{{ card.name }}</h1>",
        "source_css" => "h1 { color: #123456; }",
        "diagnostics" => "文字靠近边缘",
        "requirement" => "蓝色夏令营"
      }
    )
  end

  test "认证节点领取任务并提交安全结果" do
    job = queued_job

    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: { agent_version: "0.2.0", mai_ready: true, renderer_ready: true, agent_model_ready: true, agent_model_id: "node-local-default" }
    }, headers: node_headers

    assert_response :success
    lease = body.dig("job", "lease_token")
    assert_not_nil lease
    assert_equal job.id.to_s, body.dig("job", "id")
    assert_equal 55, body.dig("job", "width_mm")
    assert_equal 85, body.dig("job", "height_mm")
    assert_nil body.dig("desired_config", "claude_model")
    assert_equal "leased", job.reload.status
    assert_equal true, @node.reload.capabilities["mai_ready"]

    job.update!(lease_expires_at: 5.minutes.from_now)
    before_renewal = job.reload.lease_expires_at
    another_job = queued_job
    post "/api/v1/internal/template-agent/heartbeat", params: {
      current_job_id: job.id,
      capabilities: { agent_version: "0.2.0", mai_ready: true, renderer_ready: true, agent_model_ready: true, agent_model_id: "node-local-default" }
    }, headers: node_headers
    assert_response :success
    assert_operator job.reload.lease_expires_at, :>, before_renewal
    assert_nil body["job"]
    assert_equal "queued", another_job.reload.status

    post "/api/v1/internal/template-agent/jobs/#{job.id}/complete", params: {
      lease_token: lease,
      status: "succeeded",
      source_html: "<h1>{{ card.name }}</h1>",
      source_css: "h1 { color: #2468ac; }",
      report: { iterations: [] }
    }, headers: node_headers

    assert_response :no_content
    job.reload
    assert_equal "succeeded", job.status
    assert_equal true, job.result.dig("validation_report", "valid")
  end

  test "心跳只下发管理员选择的模型与 Base URL，不含 API Key" do
    @node.update!(desired_config: {
      "claude_model_id" => "agent-haiku",
      "claude_model" => "claude-haiku-test",
      "claude_base_url" => "https://anthropic.example.test"
    })

    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: { agent_version: "0.2.0", mai_ready: false, renderer_ready: false }
    }, headers: node_headers

    assert_response :success
    assert_equal "claude-haiku-test", body.dig("desired_config", "claude_model")
    assert_equal "https://anthropic.example.test", body.dig("desired_config", "claude_base_url")
    assert_not_includes response.body, "api_key"
  end

  test "节点凭据错误不能领取任务" do
    queued_job

    post "/api/v1/internal/template-agent/heartbeat", params: { capabilities: { agent_version: "0.2.0" } }, headers: node_headers(token: "wrong")

    assert_response :unauthorized
    assert_equal "queued", TemplateGenerationJob.last.status
  end

  test "未就绪的节点只上报状态，不会领取视觉任务" do
    job = queued_job

    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: { agent_version: "0.2.0", mai_ready: false, renderer_ready: true }
    }, headers: node_headers

    assert_response :success
    assert_nil body["job"]
    assert_equal "queued", job.reload.status
    assert_equal false, @node.reload.capabilities["mai_ready"]
  end

  test "模型探测失败的节点会保留诊断但不会领取视觉任务" do
    job = queued_job

    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: {
        agent_version: "0.2.0", mai_ready: true, renderer_ready: true,
        agent_model_id: "agent-proxy", agent_model_ready: false,
        agent_model_error: "Claude Agent 模型探测失败：认证、模型名或协议不可用"
      }
    }, headers: node_headers

    assert_response :success
    assert_nil body["job"]
    assert_equal "queued", job.reload.status
    assert_equal "agent-proxy", @node.reload.capabilities["agent_model_id"]
    assert_includes @node.capabilities["agent_model_error"], "协议不可用"
  end

  test "其他节点不能完成已租出的任务" do
    job = queued_job
    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: { agent_version: "0.2.0", mai_ready: true, renderer_ready: true, agent_model_ready: true, agent_model_id: "node-local-default" }
    }, headers: node_headers
    lease = body.dig("job", "lease_token")
    GpuNode.create!(node_key: "other-node", name: "Other", token: "other-secret")

    post "/api/v1/internal/template-agent/jobs/#{job.id}/complete", params: {
      lease_token: lease, status: "failed", error: "nope"
    }, headers: { "Authorization" => "Bearer other-secret", "X-Template-Agent-Node" => "other-node" }

    assert_response :not_found
    assert_equal "leased", job.reload.status
  end

  test "已取消的节点任务会通过下一次心跳下发停止命令并保留审计记录" do
    job = queued_job
    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: { agent_version: "0.2.0", mai_ready: true, renderer_ready: true, agent_model_ready: true, agent_model_id: "node-local-default" }
    }, headers: node_headers

    job.cancel!(reason: "用户主动停止")
    post "/api/v1/internal/template-agent/heartbeat", params: {
      current_job_id: job.id,
      capabilities: { agent_version: "0.2.0", mai_ready: true, renderer_ready: true, agent_model_ready: true, agent_model_id: "node-local-default" }
    }, headers: node_headers

    assert_response :success
    assert_equal true, body.fetch("cancel_current_job")
    assert_nil body["job"]
    assert_equal "cancelled", job.reload.status
    assert_equal "用户主动停止", job.stage_results.dig("cancellation", "reason")
    assert_not_nil job.stage_results.dig("cancellation", "cancelled_at")
  end

  test "自动视觉检查完成后会把修复后的草案回写给父生成任务" do
    parent = @user.template_generation_jobs.create!(
      job_type: "template_generation",
      status: "waiting_for_visual_review",
      stage: "visual_review",
      complexity: 5,
      payload: { "requirement" => "蓝色名牌" },
      result: { "html" => "<h1>{{ card.name }}</h1>", "css" => "h1 { color: #123456; }", "notes" => "初稿" }
    )
    job = @user.template_generation_jobs.create!(
      job_type: "visual_repair",
      complexity: 5,
      payload: {
        "source_html" => "<h1>{{ card.name }}</h1>",
        "source_css" => "h1 { color: #123456; }",
        "parent_generation_job_id" => parent.id
      }
    )

    post "/api/v1/internal/template-agent/heartbeat", params: {
      capabilities: { agent_version: "0.2.0", mai_ready: true, renderer_ready: true, agent_model_ready: true, agent_model_id: "node-local-default" }
    }, headers: node_headers
    lease = body.dig("job", "lease_token")
    post "/api/v1/internal/template-agent/jobs/#{job.id}/complete", params: {
      lease_token: lease,
      status: "succeeded",
      source_html: "<h1>{{ card.name }}</h1>",
      source_css: "h1 { color: #2468ac; }",
      report: { iterations: [ { iteration: 1 } ] }
    }, headers: node_headers

    assert_response :no_content
    parent.reload
    assert_equal "succeeded", parent.status
    assert_equal "review_ready", parent.stage
    assert_equal "h1 { color: #2468ac; }", parent.result["css"]
    assert_equal 1, parent.result.dig("visual_review", "iterations").length
  end
end
