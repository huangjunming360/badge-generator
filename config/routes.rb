Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  resource :setting, only: %i[update]

  resources :cards, only: %i[index new create show update]

  # 前后端分离：前端（frontend/）由 nginx 静态托管，只经这套 JSON API 通信。
  namespace :api do
    namespace :v1 do
      resource :schema, only: %i[show], controller: "schema"
      resources :cards, only: %i[index show create update]
    end
  end

  root "cards#new"
end
