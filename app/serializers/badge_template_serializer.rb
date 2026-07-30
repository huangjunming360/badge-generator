class BadgeTemplateSerializer
  def initialize(template)
    @template = template
  end

  def summary
    {
      id: @template.id,
      name: @template.name,
      orientation: @template.orientation,
      width_mm: @template.width_mm,
      height_mm: @template.height_mm,
      status: @template.status,
      published_version: published_version_payload
    }
  end

  def admin_detail
    summary.merge(
      owner_id: @template.owner_id,
      versions: @template.versions.order(version: :desc).map { |version| version_payload(version, include_source: true) }
    )
  end

  def version_detail(version)
    version_payload(version, include_source: true)
  end

  private

  def published_version_payload
    return nil unless @template.published_version

    version_payload(@template.published_version)
  end

  def version_payload(version, include_source: false)
    payload = {
      id: version.id,
      version: version.version,
      source_kind: version.source_kind,
      validation_report: version.validation_report,
      created_at: version.created_at&.iso8601
    }
    if include_source
      payload[:source_html] = version.source_html
      payload[:source_css] = version.source_css
    end
    payload
  end
end
