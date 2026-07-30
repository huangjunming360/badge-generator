class CreateGpuNodesAndTemplateGenerationJobs < ActiveRecord::Migration[8.1]
  def change
    create_table :gpu_nodes do |t|
      t.string :node_key, null: false
      t.string :name, null: false
      t.string :token_digest, null: false
      t.boolean :active, null: false, default: true
      t.json :capabilities, null: false, default: {}
      t.json :desired_config, null: false, default: {}
      t.datetime :last_seen_at
      t.timestamps
    end
    add_index :gpu_nodes, :node_key, unique: true

    create_table :template_generation_jobs do |t|
      t.references :requested_by, null: false, foreign_key: { to_table: :users }
      t.references :badge_template, foreign_key: true
      t.references :gpu_node, foreign_key: true
      t.string :job_type, null: false
      t.string :status, null: false, default: "queued"
      t.integer :complexity, null: false, default: 5
      t.json :payload, null: false, default: {}
      t.json :result, null: false, default: {}
      t.text :error_message
      t.string :lease_token_digest
      t.datetime :lease_expires_at
      t.datetime :completed_at
      t.integer :attempts, null: false, default: 0
      t.timestamps
    end
    add_index :template_generation_jobs, :status
    add_index :template_generation_jobs, [ :gpu_node_id, :status ]
  end
end
