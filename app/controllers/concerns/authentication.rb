module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated?
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private
    def authenticated?
      resume_session
    end

    def require_authentication
      return true if resume_session

      request_authentication
    end

    def require_active_user
      return unless resume_session

      user = Current.user
      return unless user

      if user.banned?
        terminate_session
        respond_to do |format|
          format.html { redirect_to new_session_path, alert: "账号已被封禁" }
          format.json { render json: { errors: [ "账号已被封禁" ] }, status: :forbidden }
        end
      elsif !user.active?
        terminate_session
        respond_to do |format|
          format.html { redirect_to new_session_path, alert: "账号尚未激活，请联系管理员" }
          format.json { render json: { errors: [ "账号尚未激活" ] }, status: :forbidden }
        end
      end
    end

    def resume_session
      Current.session ||= find_session_by_cookie
    end

    def find_session_by_cookie
      Session.find_by(id: cookies.signed[:session_id]) if cookies.signed[:session_id]
    end

    def request_authentication
      session[:return_to_after_authenticating] = request.url
      redirect_to new_session_path
    end

    def after_authentication_url
      session.delete(:return_to_after_authenticating) || root_url
    end

    def start_new_session_for(user)
      user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session|
        Current.session = session
        cookies.signed.permanent[:session_id] = { value: session.id, httponly: true, same_site: :lax }
      end
    end

    def terminate_session
      Current.session.destroy
      cookies.delete(:session_id)
    end
end
