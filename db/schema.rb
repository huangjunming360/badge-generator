# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_31_010000) do
  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "badge_template_versions", force: :cascade do |t|
    t.integer "badge_template_id", null: false
    t.datetime "created_at", null: false
    t.integer "created_by_id", null: false
    t.json "semantic_fields", default: [{"key" => "participant_name", "label" => "姓名"}, {"key" => "participant_name_en", "label" => "英文名"}, {"key" => "organization", "label" => "单位"}, {"key" => "host_organization", "label" => "组织机构"}, {"key" => "host_department", "label" => "组织部门"}, {"key" => "event_topic", "label" => "项目主题"}, {"key" => "event_topic_en", "label" => "项目主题英文"}], null: false
    t.text "source_css", default: "", null: false
    t.text "source_html", null: false
    t.string "source_kind", default: "manual", null: false
    t.datetime "updated_at", null: false
    t.json "validation_report"
    t.integer "version", null: false
    t.index ["badge_template_id", "version"], name: "index_badge_template_versions_on_badge_template_id_and_version", unique: true
    t.index ["badge_template_id"], name: "index_badge_template_versions_on_badge_template_id"
    t.index ["created_by_id"], name: "index_badge_template_versions_on_created_by_id"
  end

  create_table "badge_templates", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "height_mm", default: 85, null: false
    t.string "name", null: false
    t.string "orientation", default: "portrait", null: false
    t.integer "owner_id", null: false
    t.integer "published_version_id"
    t.string "status", default: "draft", null: false
    t.datetime "updated_at", null: false
    t.string "visibility", default: "public", null: false
    t.integer "width_mm", default: 55, null: false
    t.index ["owner_id"], name: "index_badge_templates_on_owner_id"
    t.index ["published_version_id"], name: "index_badge_templates_on_published_version_id"
    t.index ["visibility"], name: "index_badge_templates_on_visibility"
  end

  create_table "cards", force: :cascade do |t|
    t.integer "badge_template_id"
    t.integer "badge_template_version_id"
    t.datetime "created_at", null: false
    t.json "data"
    t.integer "height_mm"
    t.text "raw_input"
    t.string "source_name"
    t.datetime "updated_at", null: false
    t.boolean "used_ocr"
    t.integer "user_id"
    t.integer "width_mm"
    t.index ["badge_template_id"], name: "index_cards_on_badge_template_id"
    t.index ["badge_template_version_id"], name: "index_cards_on_badge_template_version_id"
    t.index ["user_id"], name: "index_cards_on_user_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "title"
    t.datetime "updated_at", null: false
  end

  create_table "gpu_nodes", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.json "capabilities", default: {}, null: false
    t.datetime "created_at", null: false
    t.json "desired_config", default: {}, null: false
    t.datetime "last_seen_at"
    t.string "name", null: false
    t.string "node_key", null: false
    t.string "token_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["node_key"], name: "index_gpu_nodes_on_node_key", unique: true
  end

  create_table "messages", force: :cascade do |t|
    t.text "content"
    t.integer "conversation_id", null: false
    t.datetime "created_at", null: false
    t.string "role"
    t.datetime "updated_at", null: false
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key"
    t.datetime "updated_at", null: false
    t.text "value"
    t.index ["key"], name: "index_settings_on_key", unique: true
  end

  create_table "template_design_messages", force: :cascade do |t|
    t.text "content", default: "", null: false
    t.datetime "created_at", null: false
    t.json "metadata", default: {}, null: false
    t.string "role", null: false
    t.string "state", default: "complete", null: false
    t.integer "template_design_session_id", null: false
    t.integer "template_generation_job_id"
    t.datetime "updated_at", null: false
    t.index ["template_design_session_id", "created_at"], name: "index_design_messages_in_order"
    t.index ["template_design_session_id"], name: "index_design_messages_on_session"
    t.index ["template_generation_job_id"], name: "index_design_messages_on_job"
  end

  create_table "template_design_sessions", force: :cascade do |t|
    t.json "configuration", default: {}, null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "owner_id", null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_id", "updated_at"], name: "index_template_design_sessions_on_owner_id_and_updated_at"
    t.index ["owner_id"], name: "index_template_design_sessions_on_owner_id"
  end

  create_table "template_generation_jobs", force: :cascade do |t|
    t.integer "attempts", default: 0, null: false
    t.integer "badge_template_id"
    t.datetime "completed_at"
    t.integer "complexity", default: 5, null: false
    t.datetime "created_at", null: false
    t.text "error_message"
    t.integer "gpu_node_id"
    t.string "job_type", null: false
    t.datetime "lease_expires_at"
    t.string "lease_token_digest"
    t.json "payload", default: {}, null: false
    t.integer "requested_by_id", null: false
    t.json "result", default: {}, null: false
    t.string "stage", default: "queued", null: false
    t.string "stage_message"
    t.json "stage_results", default: {}, null: false
    t.datetime "started_at"
    t.string "status", default: "queued", null: false
    t.integer "template_design_session_id"
    t.datetime "updated_at", null: false
    t.index ["badge_template_id"], name: "index_template_generation_jobs_on_badge_template_id"
    t.index ["gpu_node_id", "status"], name: "index_template_generation_jobs_on_gpu_node_id_and_status"
    t.index ["gpu_node_id"], name: "index_template_generation_jobs_on_gpu_node_id"
    t.index ["requested_by_id"], name: "index_template_generation_jobs_on_requested_by_id"
    t.index ["status"], name: "index_template_generation_jobs_on_status"
    t.index ["template_design_session_id"], name: "index_template_generation_jobs_on_template_design_session_id"
  end

  create_table "users", force: :cascade do |t|
    t.boolean "active", default: true
    t.datetime "banned_at"
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.integer "model_level", default: 0
    t.string "password_digest", null: false
    t.string "role", default: "user"
    t.datetime "updated_at", null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "badge_template_versions", "badge_templates"
  add_foreign_key "badge_template_versions", "users", column: "created_by_id"
  add_foreign_key "badge_templates", "badge_template_versions", column: "published_version_id"
  add_foreign_key "badge_templates", "users", column: "owner_id"
  add_foreign_key "cards", "badge_template_versions"
  add_foreign_key "cards", "badge_templates"
  add_foreign_key "cards", "users"
  add_foreign_key "messages", "conversations"
  add_foreign_key "sessions", "users"
  add_foreign_key "template_design_messages", "template_design_sessions"
  add_foreign_key "template_design_messages", "template_generation_jobs"
  add_foreign_key "template_design_sessions", "users", column: "owner_id"
  add_foreign_key "template_generation_jobs", "badge_templates"
  add_foreign_key "template_generation_jobs", "gpu_nodes"
  add_foreign_key "template_generation_jobs", "template_design_sessions"
  add_foreign_key "template_generation_jobs", "users", column: "requested_by_id"
end
