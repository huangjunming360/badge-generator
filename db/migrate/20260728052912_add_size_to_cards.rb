class AddSizeToCards < ActiveRecord::Migration[8.1]
  def change
    add_column :cards, :width_mm, :integer
    add_column :cards, :height_mm, :integer
  end
end
