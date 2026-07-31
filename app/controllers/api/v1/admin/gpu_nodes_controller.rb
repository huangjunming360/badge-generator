require "uri"

class Api::V1::Admin::GpuNodesController < Api::BaseController
  # GPU nodes are global infrastructure, not user-owned records. Every action
  # is therefore restricted to administrators rather than Current.user scope.
  before_action :require_api_admin
  before_action :load_node, only: %i[update_config rotate_token revoke]

  rate_limit to: 10, within: 1.minute, only: %i[create rotate_token revoke],
    with: -> { render json: { errors: [ "节点凭据操作过于频繁，请稍后再试" ] }, status: :too_many_requests }
  rate_limit to: 30, within: 1.minute, only: :update_config,
    with: -> { render json: { errors: [ "节点配置操作过于频繁，请稍后再试" ] }, status: :too_many_requests }

  def index
    nodes = GpuNode.order(updated_at: :desc)
    render json: {
      nodes: nodes.map { |node| node_payload(node) },
      agent_models: agent_models
    }
  end

  def create
    server_url = normalize_server_url(create_params.fetch(:server_url))
    token = SecureRandom.urlsafe_base64(48)
    node = GpuNode.create!(
      node_key: generated_node_key,
      name: create_params.fetch(:name),
      token: token,
      desired_config: GpuNode::DEFAULT_DESIRED_CONFIG
    )
    render_credentials(node, token, server_url, status: :created)
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def update_config
    current_config = @node.effective_desired_config
    configuration = @node.effective_desired_config.merge(
      "paused" => config_params.key?(:paused) ? ActiveModel::Type::Boolean.new.cast(config_params[:paused]) : current_config.fetch("paused"),
      "max_iterations" => config_params.fetch(:max_iterations, current_config.fetch("max_iterations")).to_i.clamp(1, 200),
      "max_concurrency" => 1
    )
    configuration.merge!(agent_model_configuration(config_params[:claude_model_id])) if config_params.key?(:claude_model_id)
    @node.update!(desired_config: configuration)
    render json: { node: node_payload(@node) }
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_content
  end

  def rotate_token
    server_url = normalize_server_url(credential_params.fetch(:server_url))
    token = SecureRandom.urlsafe_base64(48)
    @node.update!(token: token)
    render_credentials(@node, token, server_url, status: :ok)
  end

  def revoke
    released = 0
    @node.with_lock do
      @node.template_generation_jobs.where(status: "leased").find_each do |job|
        released += 1 if job.release_node_lease!
      end
      # Replacing the digest invalidates a stolen token even if the node is
      # enabled later by a future administration action.
      @node.update!(active: false, token: SecureRandom.urlsafe_base64(48))
    end
    render json: { node: node_payload(@node), released_jobs: released }
  end

  private

  def load_node
    @node = GpuNode.find(params[:id])
  end

  def create_params
    params.require(:gpu_node).permit(:name, :server_url).tap do |values|
      raise ActionController::ParameterMissing, "gpu_node.server_url" if values[:server_url].blank?
    end
  end

  def credential_params
    params.require(:gpu_node).permit(:server_url).tap do |values|
      raise ActionController::ParameterMissing, "gpu_node.server_url" if values[:server_url].blank?
    end
  end

  def config_params
    params.require(:gpu_node).permit(:paused, :max_iterations, :claude_model_id)
  end

  def agent_models
    configured_models.filter_map do |model|
      capabilities = Array(model["capabilities"]).map(&:to_s)
      next unless model["id"].present? && model["model"].present?
      next unless capabilities.intersect?(%w[claude_agent_sdk anthropic_messages])

      {
        id: model["id"],
        label: model["label"].presence || model["id"],
        model: model["model"],
        api_base: model["api_base"].presence,
        capabilities: capabilities
      }
    end
  end

  def agent_model_configuration(model_id)
    return { "claude_model_id" => nil, "claude_model" => nil, "claude_base_url" => nil } if model_id.blank?

    selected = agent_models.find { |model| model[:id] == model_id }
    raise ActionController::ParameterMissing, "gpu_node.claude_model_id（必须选择已声明 Claude Agent 兼容能力的模型）" unless selected

    {
      "claude_model_id" => selected.fetch(:id),
      "claude_model" => selected.fetch(:model),
      "claude_base_url" => selected[:api_base]
    }
  end

  def configured_models
    Rails.application.config.x.models.fetch("models", [])
  end

  def generated_node_key
    loop do
      key = "node-#{SecureRandom.hex(6)}"
      return key unless GpuNode.exists?(node_key: key)
    end
  end

  def render_credentials(node, token, server_url, status:)
    response.headers["Cache-Control"] = "no-store"
    render json: {
      node: node_payload(node),
      credentials: {
        node_id: node.node_key,
        token: token,
        environment: {
          "TEMPLATE_AGENT_SERVER_URL" => server_url,
          "TEMPLATE_AGENT_NODE_ID" => node.node_key,
          "TEMPLATE_AGENT_NODE_TOKEN" => token
        }
      }
    }, status: status
  end

  def normalize_server_url(value)
    uri = URI.parse(value.to_s.strip)
    valid = uri.is_a?(URI::HTTP) && uri.host.present? && uri.userinfo.blank? && uri.query.blank? && uri.fragment.blank?
    raise ActionController::ParameterMissing, "gpu_node.server_url（必须为 http 或 https URL）" unless valid

    uri.to_s.delete_suffix("/")
  rescue URI::InvalidURIError
    raise ActionController::ParameterMissing, "gpu_node.server_url（必须为有效 URL）"
  end

  def node_payload(node)
    {
      id: node.id,
      node_key: node.node_key,
      name: node.name,
      active: node.active?,
      online: node.online?,
      ready: node.ready_for_visual_repair?,
      last_seen_at: node.last_seen_at&.iso8601,
      capabilities: node.capabilities.to_h,
      desired_config: node.effective_desired_config,
      leased_jobs_count: node.template_generation_jobs.where(status: "leased").count
    }
  end
end
