require "test_helper"

class Api::V1::TemplateDesignSessionsTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "design-admin@test.com", password: "test123", password_confirmation: "test123", role: "admin")
    @other = User.create!(email_address: "design-other@test.com", password: "test123", password_confirmation: "test123", role: "admin")
  end

  def sign_in(user)
    post session_url, params: { email_address: user.email_address, password: "test123" }
    follow_redirect!
  end

  def body
    JSON.parse(response.body)
  end

  test "会话持久化首条需求、任务和待发送消息" do
    sign_in(@admin)

    post "/api/v1/template_design_sessions", params: {
      name: "夏令营名牌",
      initial_message: "做一个清爽的蓝色夏令营名牌",
      configuration: { complexity: 6, width_mm: 55, height_mm: 85, model_id: "fast" }
    }

    assert_response :created
    session = body.fetch("session")
    assert_equal "夏令营名牌", session.fetch("name")
    assert_equal 6, session.dig("configuration", "complexity")
    assert_equal "processing", session.fetch("messages").first.fetch("state")
    assert_equal "template_generation", session.fetch("active_job").fetch("job_type")
    session_id = session.fetch("id")

    post "/api/v1/template_design_sessions/#{session_id}/append_message", params: { content: "把主标题更醒目" }
    assert_response :accepted
    assert_equal "queued", body.dig("message", "state")

    get "/api/v1/template_design_sessions/#{session_id}"
    assert_response :success
    assert_equal 2, body.dig("session", "messages").count { |message| message["role"] == "user" }
    assert_equal 1, body.dig("session", "jobs").length
  end

  test "暂停当前任务会取消租约并立即派发下一条需求" do
    sign_in(@admin)
    session = @admin.template_design_sessions.create!(name: "暂停测试")
    first = session.queue_user_message!(content: "第一版")
    second = session.queue_user_message!(content: "第二版")

    assert_equal "processing", first.reload.state
    assert_equal "queued", second.reload.state

    post "/api/v1/template_design_sessions/#{session.id}/interrupt"

    assert_response :success
    assert_equal "cancelled", first.reload.state
    assert_equal "processing", second.reload.state
    assert_equal "cancelled", first.template_generation_job.reload.status
    assert_equal "用户已停止本轮设计", first.template_generation_job.stage_results.dig("cancellation", "reason")
    assert_equal "queued", second.template_generation_job.reload.status
  end

  test "其他用户不能读取或中断会话" do
    session = @admin.template_design_sessions.create!(name: "私有会话")
    sign_in(@other)

    get "/api/v1/template_design_sessions/#{session.id}"
    assert_response :not_found

    post "/api/v1/template_design_sessions/#{session.id}/interrupt"
    assert_response :not_found
  end
end
