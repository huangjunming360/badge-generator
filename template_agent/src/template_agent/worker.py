import logging
import threading
import time
from datetime import UTC, datetime

import httpx

from .client import RailsControlPlane
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

    def run_forever(self) -> None:
        while True:
            try:
                response = self._control_plane.heartbeat(self._heartbeat())
                if response.job and not response.desired_config.paused:
                    self._run_job(response.job, max_iterations=response.desired_config.max_iterations)
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

    def _run_job(self, job: TemplateJob, max_iterations: int) -> None:
        stop_heartbeat = threading.Event()
        lease_thread = threading.Thread(
            target=self._keep_lease_alive,
            args=(job.id, stop_heartbeat),
            daemon=True,
        )
        lease_thread.start()
        try:
            result = self._run_visual_repair(job, max_iterations)
        except (RenderError, VisualRepairError) as error:
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

    def _run_visual_repair(self, job: TemplateJob, max_iterations: int) -> JobResult:
        if job.job_type != "visual_repair":
            return JobResult(status="failed", error="不支持的节点任务类型")
        repaired = self._repairer.repair(job, max_iterations=max_iterations)
        return JobResult(
            status="succeeded",
            source_html=repaired.source_html,
            source_css=repaired.source_css,
            report=repaired.report,
        )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    TemplateAgent(Settings()).run_forever()
