Rails.application.routes.draw do
  resource :session
  resources :passwords, param: :token
  resource :registration, only: %i[new create], as: :registration

  get "up" => "rails/health#show", as: :rails_health_check

  resource :setting, only: %i[update]

  resources :cards, only: %i[index new create show update]

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

  root "cards#new"
end
