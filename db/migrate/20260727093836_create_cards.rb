class CreateCards < ActiveRecord::Migration[8.1]
  def change
    create_table :cards do |t|
      t.text :raw_input
      t.json :data

      t.timestamps
    end
  end
end
