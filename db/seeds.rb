# 种子数据

# 管理员账号。首次部署务必通过环境变量 ADMIN_PASSWORD 修改密码。
admin = User.find_or_initialize_by(email_address: "admin@example.com")
if admin.new_record?
  pw = ENV.fetch("ADMIN_PASSWORD", SecureRandom.hex(16))
  admin.password = pw
  admin.password_confirmation = pw
  admin.role = "admin"
  admin.active = true
  admin.save!
  puts "管理员账号创建成功: admin@example.com"
  puts "密码: #{pw}" if ENV["ADMIN_PASSWORD"].present?
else
  puts "管理员账号已存在"
end

# 默认设置
Setting.find_or_create_by!(key: "site_title") do |s|
  s.value = "Badge Generator"
end
Setting.find_or_create_by!(key: "allow_registration") do |s|
  s.value = "true"
end
Setting.find_or_create_by!(key: "require_login_for_models") do |s|
  s.value = "true"
end
Setting.find_or_create_by!(key: "mineru_enabled") { |s| s.value = "false" }
Setting.find_or_create_by!(key: "allowed_extensions") { |s| s.value = ".docx .pdf .xlsx .csv .txt .md .png .jpg .jpeg .bmp" }
puts "默认设置已初始化"
