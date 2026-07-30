class Api::V1::BadgeTemplatesController < Api::BaseController
  def index
    templates = BadgeTemplate.publicly_available.order(updated_at: :desc)
    render json: { templates: templates.map { |template| BadgeTemplateSerializer.new(template).summary } }
  end

  def show
    template = BadgeTemplate.publicly_available.find(params[:id])
    render json: { template: BadgeTemplateSerializer.new(template).summary }
  end

  def preview
    template = BadgeTemplate.publicly_available.find(params[:id])
    card = Current.user.cards.find(params[:card_id])
    version = template.published_version
    render json: {
      template: BadgeTemplateSerializer.new(template).summary,
      html: BadgeTemplateRenderer.render(version:, card:)
    }
  rescue BadgeTemplateRenderer::InvalidTemplate => e
    render json: { errors: [ e.message ] }, status: :unprocessable_content
  end
end
