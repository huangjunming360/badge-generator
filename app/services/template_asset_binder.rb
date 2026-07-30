# frozen_string_literal: true

# Copies only the requesting user's reference assets into a template. Keeping
# this step server-side prevents a template from pointing at another user's
# upload or an arbitrary remote URL.
class TemplateAssetBinder
  def self.attach_generation_assets!(template:, user:, generation_job_id:)
    return if generation_job_id.blank?

    job = user.template_generation_jobs.find(generation_job_id)
    raise ActiveRecord::RecordNotFound unless job.job_type == "template_generation"

    existing_blob_ids = template.design_assets.attachments.pluck(:blob_id)
    new_blobs = job.reference_assets.blobs.reject { |blob| existing_blob_ids.include?(blob.id) }
    template.design_assets.attach(new_blobs) if new_blobs.any?
  end
end
