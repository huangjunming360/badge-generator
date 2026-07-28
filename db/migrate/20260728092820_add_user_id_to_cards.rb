class AddUserIdToCards < ActiveRecord::Migration[8.1]
  def change
    add_reference :cards, :user, null: true, foreign_key: true
  end
end
