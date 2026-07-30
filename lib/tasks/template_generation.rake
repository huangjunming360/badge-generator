namespace :template_generation do
  desc "Run the durable server-side template generation worker"
  task worker: :environment do
    interval = ENV.fetch("TEMPLATE_GENERATION_POLL_SECONDS", "2").to_f.clamp(0.5, 60)
    TemplateGenerationWorker.new(poll_interval: interval.seconds).run_forever
  end
end
