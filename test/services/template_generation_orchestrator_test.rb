require "test_helper"

class TemplateGenerationOrchestratorTest < ActiveSupport::TestCase
  class FakeGenerator
    attr_reader :received

    def generate(**arguments)
      @received = arguments
      {
        "html" => "<article><h1>{{ card.name }}</h1></article>",
        "css" => "article { padding: 8mm; }",
        "notes" => "清晰的单栏信息层级",
        "validation_report" => { "valid" => true, "errors" => [] }
      }
    end
  end

  class FailingGenerator
    def generate(**)
      raise BadgeTemplateGenerator::Error, "上游没有返回有效模板"
    end
  end

  setup do
    @user = User.create!(email_address: "orchestrator@test.com", password: "test123", password_confirmation: "test123")
  end

  test "生成编排保存阶段结果并固化用户选择的模型" do
    job = @user.template_generation_jobs.create!(
      job_type: "template_generation",
      complexity: 8,
      payload: {
        "requirement" => "科技感夏令营名牌",
        "reference_notes" => "蓝色几何元素",
        "model_id" => "fast"
      }
    )
    generator = FakeGenerator.new

    TemplateGenerationOrchestrator.new(job, generator: generator).run

    job.reload
    assert_equal "waiting_for_visual_review", job.status
    assert_equal "visual_review", job.stage
    visual_job = @user.template_generation_jobs.where(job_type: "visual_repair").sole
    assert_equal "visual_review", visual_job.stage
    assert_equal "等待 GPU 视觉节点就绪后进行隔离检查", visual_job.stage_message
    assert_equal job.id, visual_job.payload["parent_generation_job_id"]
    assert_equal "<article><h1>{{ card.name }}</h1></article>", visual_job.payload["source_html"]
    assert_equal "fast", generator.received[:model_id]
    assert_equal "科技感夏令营名牌", job.stage_results.dig("understanding", "requirement")
    assert_equal true, job.stage_results.dig("validating", "valid")
    assert_equal "清晰的单栏信息层级", job.result["notes"]
  end

  test "生成失败会终止于失败状态并保存可读错误" do
    job = @user.template_generation_jobs.create!(
      job_type: "template_generation",
      complexity: 5,
      payload: { "requirement" => "极简白色名牌" }
    )

    TemplateGenerationOrchestrator.new(job, generator: FailingGenerator.new).run

    job.reload
    assert_equal "failed", job.status
    assert_equal "generating", job.stage
    assert_equal "上游没有返回有效模板", job.error_message
  end
end
