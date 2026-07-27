class AddSourceNameToCards < ActiveRecord::Migration[8.1]
  def change
    add_column :cards, :source_name, :string
  end
end
