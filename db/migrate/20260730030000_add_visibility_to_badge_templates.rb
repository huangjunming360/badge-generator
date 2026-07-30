class AddVisibilityToBadgeTemplates < ActiveRecord::Migration[8.1]
  def change
    add_column :badge_templates, :visibility, :string, null: false, default: "public"
    add_index :badge_templates, :visibility
  end
end
