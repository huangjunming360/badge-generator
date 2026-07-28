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
