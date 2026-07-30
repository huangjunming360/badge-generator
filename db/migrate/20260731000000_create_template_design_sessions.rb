class CreateTemplateDesignSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :template_design_sessions do |t|
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.string :status, null: false, default: "active"
      t.json :configuration, null: false, default: {}
      t.timestamps
    end
    add_index :template_design_sessions, [ :owner_id, :updated_at ]

    create_table :template_design_messages do |t|
      t.references :template_design_session, null: false, foreign_key: true, index: { name: "index_design_messages_on_session" }
      t.references :template_generation_job, foreign_key: true, index: { name: "index_design_messages_on_job" }
      t.string :role, null: false
      t.string :state, null: false, default: "complete"
      t.text :content, null: false, default: ""
      t.json :metadata, null: false, default: {}
      t.timestamps
    end
    add_index :template_design_messages, [ :template_design_session_id, :created_at ], name: "index_design_messages_in_order"

    add_reference :template_generation_jobs, :template_design_session, foreign_key: true
  end
end
