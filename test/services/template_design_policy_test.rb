# frozen_string_literal: true

require "test_helper"

class TemplateDesignPolicyTest < ActiveSupport::TestCase
  test "普通用户参考素材额度由后台配置但不能超过系统安全上限" do
    user = User.create!(email_address: "asset-limit@test.com", password: "test123", password_confirmation: "test123")
    Setting.set("user_template_reference_asset_limit", 2)

    assert_equal 2, TemplateDesignPolicy.reference_asset_limit(user)

    Setting.set("user_template_reference_asset_limit", 999)
    assert_equal TemplateGenerationJob::MAX_REFERENCE_ASSETS, TemplateDesignPolicy.reference_asset_limit(user)
  end

  test "管理员始终使用系统参考素材安全上限" do
    admin = User.create!(email_address: "asset-limit-admin@test.com", password: "test123", password_confirmation: "test123", role: "admin")
    Setting.set("user_template_reference_asset_limit", 0)

    assert_equal TemplateGenerationJob::MAX_REFERENCE_ASSETS, TemplateDesignPolicy.reference_asset_limit(admin)
  end
end
