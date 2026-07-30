class AddTemplateGenerationStages < ActiveRecord::Migration[8.1]
  def change
    add_column :template_generation_jobs, :stage, :string, null: false, default: "queued"
    add_column :template_generation_jobs, :stage_message, :string
    add_column :template_generation_jobs, :stage_results, :json, null: false, default: {}
    add_column :template_generation_jobs, :started_at, :datetime
  end
end
