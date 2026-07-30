require "test_helper"

class TemplateGenerationWorkerTest < ActiveSupport::TestCase
  class RecordingOrchestrator
    class << self
      attr_accessor :calls
    end

    def initialize(job)
      @job = job
    end

    def run(lease_token:)
      self.class.calls << [ @job.id, lease_token ]
      @job.update!(status: "succeeded", completed_at: Time.current, lease_token_digest: nil, lease_expires_at: nil)
    end
  end

  setup do
    @user = User.create!(email_address: "generation-worker@test.com", password: "test123", password_confirmation: "test123")
    RecordingOrchestrator.calls = []
  end

  test "worker claims a queued generation and passes a server lease to the orchestrator" do
    job = @user.template_generation_jobs.create!(job_type: "template_generation", complexity: 5, payload: { "requirement" => "蓝色夏令营" })

    worked = TemplateGenerationWorker.new(orchestrator_class: RecordingOrchestrator).run_once

    assert_equal true, worked
    assert_equal [ job.id ], RecordingOrchestrator.calls.map(&:first)
    assert_equal "succeeded", job.reload.status
    assert_equal 1, job.attempts
  end

  test "worker reclaims an expired server generation lease" do
    stale = @user.template_generation_jobs.create!(
      job_type: "template_generation",
      status: "leased",
      complexity: 5,
      payload: { "requirement" => "旧任务" },
      lease_token_digest: BCrypt::Password.create("expired"),
      lease_expires_at: 1.minute.ago
    )

    TemplateGenerationWorker.new(orchestrator_class: RecordingOrchestrator).run_once

    assert_equal [ stale.id ], RecordingOrchestrator.calls.map(&:first)
    assert_equal "succeeded", stale.reload.status
    assert_equal 1, stale.attempts
  end
end
