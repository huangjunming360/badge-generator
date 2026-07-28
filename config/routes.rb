Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  resources :cards, only: %i[index new create show update]

  root "cards#new"
end
