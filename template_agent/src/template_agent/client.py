import httpx

from .config import Settings
from .contracts import HeartbeatRequest, HeartbeatResponse, JobResult, TemplateJob


class RailsControlPlane:
    """Authenticated, outbound-only control-plane client.

    The API paths are intentionally private and will be implemented on the
    Rails side together with TemplateGenerationJob. The GPU worker never needs
    an inbound public port or access to Rails cookies.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.Client(
            base_url=str(settings.server_url).rstrip("/"),
            timeout=settings.request_timeout_seconds,
            headers={
                "Authorization": f"Bearer {settings.node_token.get_secret_value()}",
                "X-Template-Agent-Node": settings.node_id,
            },
        )

    def heartbeat(self, request: HeartbeatRequest) -> HeartbeatResponse:
        response = self._client.post("/api/v1/internal/template-agent/heartbeat", json=request.model_dump(mode="json"))
        response.raise_for_status()
        return HeartbeatResponse.model_validate(response.json())

    def complete(self, job: TemplateJob, result: JobResult) -> None:
        response = self._client.post(
            f"/api/v1/internal/template-agent/jobs/{job.id}/complete",
            json={"lease_token": job.lease_token, **result.model_dump(mode="json")},
        )
        response.raise_for_status()
