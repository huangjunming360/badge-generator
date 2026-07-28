class AddModelLevelToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :model_level, :integer, default: 0
  end
end
