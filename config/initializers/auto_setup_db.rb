# 首次运行自动建库 + 迁移 + 种子数据。
# 新机器上 clone 下来就能直接 rails s，不用手动 db:setup。
begin
  ActiveRecord::Base.connection.execute("SELECT 1")
rescue ActiveRecord::NoDatabaseError
  db_config = ActiveRecord::Base.configurations.configs_for(env_name: Rails.env).first
  if db_config
    ActiveRecord::Tasks::DatabaseTasks.create(db_config.configuration_hash)
    ActiveRecord::Tasks::DatabaseTasks.migrate
    Rails.logger.warn "[AutoSetup] 数据库已自动创建并迁移"
    # 种子数据
    load Rails.root.join("db/seeds.rb") if File.exist?(Rails.root.join("db/seeds.rb"))
  end
rescue ActiveRecord::StatementInvalid, ActiveRecord::ConnectionNotEstablished => e
  Rails.logger.warn "[AutoSetup] 数据库连接失败: #{e.message}"
end
