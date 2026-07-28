class AddRoleAndStatusToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :role, :string, default: "user"
    add_column :users, :active, :boolean, default: true
    add_column :users, :banned_at, :datetime
  end
end
