class AddSemanticFieldsToBadgeTemplateVersions < ActiveRecord::Migration[8.1]
  DEFAULT_FIELDS = [
    { "key" => "participant_name", "label" => "姓名" },
    { "key" => "participant_name_en", "label" => "英文名" },
    { "key" => "organization", "label" => "单位" },
    { "key" => "host_organization", "label" => "组织机构" },
    { "key" => "host_department", "label" => "组织部门" },
    { "key" => "event_topic", "label" => "项目主题" },
    { "key" => "event_topic_en", "label" => "项目主题英文" }
  ].freeze

  def up
    add_column :badge_template_versions, :semantic_fields, :json, null: false, default: DEFAULT_FIELDS
    execute <<~SQL.squish
      UPDATE badge_template_versions
      SET semantic_fields = #{connection.quote(DEFAULT_FIELDS.to_json)}
      WHERE semantic_fields = #{connection.quote("[]")}
    SQL
  end

  def down
    remove_column :badge_template_versions, :semantic_fields
  end
end
