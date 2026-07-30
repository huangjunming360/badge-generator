# frozen_string_literal: true

# Durable database worker for server-side template generation. Run it in a
# separate process so an HTTP request never owns an LLM call.
class TemplateGenerationWorker
  DEFAULT_POLL_INTERVAL = 2.seconds

  def self.run_once
    new.run_once
  end

  def initialize(orchestrator_class: TemplateGenerationOrchestrator, poll_interval: DEFAULT_POLL_INTERVAL)
    @orchestrator_class = orchestrator_class
    @poll_interval = poll_interval
  end

  def run_once
    claimed = TemplateGenerationJob.claim_next_for_server!
    return false unless claimed

    job, lease_token = claimed
    @orchestrator_class.new(job).run(lease_token: lease_token)
    true
  end

  def run_forever
    loop do
      worked = run_once
      sleep @poll_interval unless worked
    rescue StandardError => e
      Rails.logger.error("模板生成 worker 异常：#{e.class}: #{e.message}")
      sleep @poll_interval
    end
  end
end
