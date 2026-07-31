import logging
import threading
import time
from datetime import UTC, datetime

import httpx

from .client import RailsControlPlane
from .claude import AgentEditError, ClaudeTemplateEditor
from .cancellation import JobCancelled, raise_if_cancelled
from .config import Settings
from .contracts import DesiredConfig, HeartbeatRequest, JobResult, NodeCapabilities, TemplateJob
from .mai import MaiVisualRepairer, VisualRepairError
from .rendering import IsolatedRenderer, RenderError

LOGGER = logging.getLogger(__name__)


class TemplateAgent:
    """Outbound-only worker for visual repair jobs."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._control_plane = RailsControlPlane(settings)
        self._renderer = IsolatedRenderer(settings.renderer_image, settings.renderer_timeout_seconds)
        self._repairer = MaiVisualRepairer(settings, self._renderer)
        self._editor = ClaudeTemplateEditor(settings)
        self._desired_config = DesiredConfig()
        self._probe_signature: tuple[str, str | None] | None = None
        self._probe_ready = False
        self._probe_error: str | None = None
        self._probe_retry_at = 0.0

    def run_forever(self) -> None:
        while True:
            try:
                response = self._control_plane.heartbeat(self._heartbeat())
                self._desired_config = response.desired_config
                if response.job and not response.desired_config.paused:
                    self._run_job(
                        response.job,
                        max_iterations=response.desired_config.max_iterations,
                        claude_model=response.desired_config.claude_model,
                        claude_base_url=response.desired_config.claude_base_url,
                    )
            except httpx.HTTPError as error:
                LOGGER.warning("control plane unavailable: %s", error)
            except Exception:
                LOGGER.exception("template agent loop failed")
            time.sleep(self._settings.poll_interval_seconds)

    def _heartbeat(self, current_job_id: str | None = None) -> HeartbeatRequest:
        agent_model_id, agent_model_ready, agent_model_error = self._probe_agent_model()
        return HeartbeatRequest(
            capabilities=NodeCapabilities(
                agent_version="0.2.0",
                mai_ready=self._repairer.ready(),
                renderer_ready=self._renderer.ready(),
                agent_model_id=agent_model_id,
                agent_model_ready=agent_model_ready,
                agent_model_error=agent_model_error,
            ),
            current_job_id=current_job_id,
            sent_at=datetime.now(UTC),
        )

    def _probe_agent_model(self) -> tuple[str, bool, str | None]:
        config = self._desired_config
        local_model = getattr(self._settings, "claude_model", None)
        local_base_url = getattr(self._settings, "claude_base_url", None)
        model = config.claude_model or local_model
        base_url = config.claude_base_url or (str(local_base_url) if local_base_url else None)
        model_id = config.claude_model_id or "node-local-default"
        signature = (model or "", base_url)
        now = time.monotonic()
        if signature != self._probe_signature or now >= self._probe_retry_at:
            self._probe_signature = signature
            try:
                self._editor.probe(model=model, base_url=base_url)
                self._probe_ready = True
                self._probe_error = None
                self._probe_retry_at = now + 3600
            except AgentEditError as error:
                self._probe_ready = False
                self._probe_error = str(error)[:300]
                self._probe_retry_at = now + 300
        return model_id, self._probe_ready, self._probe_error

    def _run_job(self, job: TemplateJob, max_iterations: int, claude_model: str | None, claude_base_url: str | None) -> None:
        stop_heartbeat = threading.Event()
        cancelled = threading.Event()
        lease_thread = threading.Thread(
            target=self._keep_lease_alive,
            args=(job.id, stop_heartbeat, cancelled),
            daemon=True,
        )
        lease_thread.start()
        try:
            result = self._run_visual_repair(job, max_iterations, claude_model, claude_base_url, cancelled)
        except JobCancelled:
            LOGGER.info("job %s cancelled by control plane", job.id)
            return
        except (AgentEditError, RenderError, VisualRepairError) as error:
            LOGGER.warning("job %s failed: %s", job.id, error)
            result = JobResult(status="failed", error=str(error))
        except Exception:
            LOGGER.exception("job %s crashed", job.id)
            result = JobResult(status="failed", error="本地视觉修复器异常")
        finally:
            stop_heartbeat.set()
            lease_thread.join(timeout=self._settings.lease_heartbeat_seconds + 1)
        if not cancelled.is_set():
            self._control_plane.complete(job, result)

    def _keep_lease_alive(self, job_id: str, stopped: threading.Event, cancelled: threading.Event) -> None:
        interval = max(5, min(self._settings.lease_heartbeat_seconds, 60))
        while not stopped.wait(interval):
            try:
                response = self._control_plane.heartbeat(self._heartbeat(current_job_id=job_id))
                if response.cancel_current_job:
                    cancelled.set()
                    return
            except httpx.HTTPError as error:
                LOGGER.warning("job %s lease heartbeat failed: %s", job_id, error)
            except Exception:
                LOGGER.exception("job %s lease heartbeat crashed", job_id)

    def _run_visual_repair(self, job: TemplateJob, max_iterations: int, claude_model: str | None, claude_base_url: str | None, cancelled: threading.Event) -> JobResult:
        if job.job_type != "visual_repair":
            return JobResult(status="failed", error="不支持的节点任务类型")
        raise_if_cancelled(cancelled)
        edited = self._editor.edit(job, model=claude_model, base_url=claude_base_url, cancel_event=cancelled)
        review_job = job.model_copy(update={
            "source_html": edited.source_html,
            "source_css": edited.source_css,
        })
        repaired = self._repairer.repair(review_job, max_iterations=max_iterations, cancel_event=cancelled)
        return JobResult(
            status="succeeded",
            source_html=repaired.source_html,
            source_css=repaired.source_css,
            report={**edited.report, **repaired.report},
        )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    TemplateAgent(Settings()).run_forever()
