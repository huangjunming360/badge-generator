class Api::V1::Admin::TemplateAgentController < Api::BaseController
  before_action :require_api_admin

  def status
    node = GpuNode.order(last_seen_at: :desc).first
    render json: {
      connected: node&.last_seen_at.present? && node.last_seen_at > 2.minutes.ago,
      node: node && {
        name: node.name,
        last_seen_at: node.last_seen_at&.iso8601,
        capabilities: node.capabilities.to_h,
        paused: node.effective_desired_config.fetch("paused")
      }
    }
  end
end
