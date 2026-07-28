# 种子数据

# 管理员账号
admin = User.find_or_initialize_by(email_address: "admin@example.com")
if admin.new_record?
  admin.password = "admin123"
  admin.password_confirmation = "admin123"
  admin.role = "admin"
  admin.active = true
  admin.save!
  puts "管理员账号创建成功: admin@example.com / admin123"
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
  s.value = "false"
end
puts "默认设置已初始化"
