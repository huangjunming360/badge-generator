class CreateBadgeTemplates < ActiveRecord::Migration[8.1]
  def change
    create_table :badge_templates do |t|
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.string :orientation, null: false, default: "portrait"
      t.integer :width_mm, null: false, default: 55
      t.integer :height_mm, null: false, default: 85
      t.string :status, null: false, default: "draft"
      t.timestamps
    end

    create_table :badge_template_versions do |t|
      t.references :badge_template, null: false, foreign_key: true
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.integer :version, null: false
      t.text :source_html, null: false
      t.text :source_css, null: false, default: ""
      t.string :source_kind, null: false, default: "manual"
      t.json :validation_report

      t.timestamps
    end

    add_index :badge_template_versions, [ :badge_template_id, :version ], unique: true
    add_reference :badge_templates, :published_version, foreign_key: { to_table: :badge_template_versions }

    add_reference :cards, :badge_template, foreign_key: true
    add_reference :cards, :badge_template_version, foreign_key: true
  end
end
