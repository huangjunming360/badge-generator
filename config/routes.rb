Rails.application.routes.draw do
  # 认证
  resource :session
  resources :passwords, param: :token
  resource :registration, only: %i[new create], as: :registration

  get "up" => "rails/health#show", as: :rails_health_check

  # 管理后台
  namespace :admin do
    root "dashboard#index"
    resources :users, only: %i[index new create destroy] do
      member do
        patch :toggle_active
        patch :toggle_ban
        patch :update_level
      end
    end
    resource :settings, only: %i[edit update], controller: "settings"
    resource :general_settings, only: %i[show update], controller: "general_settings", path: "site-settings"
    resource :models, only: %i[show update], controller: "models"
    resource :permissions, only: %i[show update], controller: "permissions", path: "permissions"
  end

  # JSON API
  namespace :api do
    namespace :v1 do
      resource :session, only: %i[show create destroy], controller: "sessions"
      resource :registration, only: :create, controller: "registrations"
      resource :setup, only: %i[show create], controller: "setup"
      get "progress/:id", to: "progress#show", as: :progress
      resource :schema, only: %i[show], controller: "schema"
      resources :cards, only: %i[index show create update]
    end
  end

  # 前端 SPA —— 所有非 /admin /api 的路径都渲染 index.html
  root "frontend#index"
  get "/*path" => "frontend#index",
      constraints: ->(req) {
        !req.path.start_with?("/admin", "/api", "/rails", "/up", "/assets")
      }
end
