import logging
import threading
import time
from datetime import UTC, datetime

import httpx

from .client import RailsControlPlane
from .claude import AgentEditError, ClaudeTemplateEditor
from .config import Settings
from .contracts import HeartbeatRequest, JobResult, NodeCapabilities, TemplateJob
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

    def run_forever(self) -> None:
        while True:
            try:
                response = self._control_plane.heartbeat(self._heartbeat())
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
        return HeartbeatRequest(
            capabilities=NodeCapabilities(
                agent_version="0.2.0",
                mai_ready=self._repairer.ready(),
                renderer_ready=self._renderer.ready(),
            ),
            current_job_id=current_job_id,
            sent_at=datetime.now(UTC),
        )

    def _run_job(self, job: TemplateJob, max_iterations: int, claude_model: str | None, claude_base_url: str | None) -> None:
        stop_heartbeat = threading.Event()
        lease_thread = threading.Thread(
            target=self._keep_lease_alive,
            args=(job.id, stop_heartbeat),
            daemon=True,
        )
        lease_thread.start()
        try:
            result = self._run_visual_repair(job, max_iterations, claude_model, claude_base_url)
        except (AgentEditError, RenderError, VisualRepairError) as error:
            LOGGER.warning("job %s failed: %s", job.id, error)
            result = JobResult(status="failed", error=str(error))
        except Exception:
            LOGGER.exception("job %s crashed", job.id)
            result = JobResult(status="failed", error="本地视觉修复器异常")
        finally:
            stop_heartbeat.set()
            lease_thread.join(timeout=self._settings.lease_heartbeat_seconds + 1)
        self._control_plane.complete(job, result)

    def _keep_lease_alive(self, job_id: str, stopped: threading.Event) -> None:
        interval = max(5, min(self._settings.lease_heartbeat_seconds, 60))
        while not stopped.wait(interval):
            try:
                self._control_plane.heartbeat(self._heartbeat(current_job_id=job_id))
            except httpx.HTTPError as error:
                LOGGER.warning("job %s lease heartbeat failed: %s", job_id, error)
            except Exception:
                LOGGER.exception("job %s lease heartbeat crashed", job_id)

    def _run_visual_repair(self, job: TemplateJob, max_iterations: int, claude_model: str | None, claude_base_url: str | None) -> JobResult:
        if job.job_type != "visual_repair":
            return JobResult(status="failed", error="不支持的节点任务类型")
        edited = self._editor.edit(job, model=claude_model, base_url=claude_base_url)
        review_job = job.model_copy(update={
            "source_html": edited.source_html,
            "source_css": edited.source_css,
        })
        repaired = self._repairer.repair(review_job, max_iterations=max_iterations)
        return JobResult(
            status="succeeded",
            source_html=repaired.source_html,
            source_css=repaired.source_css,
            report={**edited.report, **repaired.report},
        )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    TemplateAgent(Settings()).run_forever()
