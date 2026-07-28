class AddUsedOcrToCards < ActiveRecord::Migration[8.1]
  def change
    add_column :cards, :used_ocr, :boolean
  end
end
