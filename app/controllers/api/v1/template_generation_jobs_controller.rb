class Api::V1::TemplateGenerationJobsController < Api::BaseController
  def show
    job = Current.user.template_generation_jobs.find(params[:id])
    render json: {
      job: {
        id: job.id,
        job_type: job.job_type,
        status: job.status,
        stage: job.stage,
        stage_message: job.stage_message,
        result: job.result,
        error_message: job.error_message,
        created_at: job.created_at.iso8601,
        completed_at: job.completed_at&.iso8601
      }
    }
  end
end
