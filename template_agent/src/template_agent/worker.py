import logging
import json
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
                        max_model_calls=response.desired_config.max_model_calls,
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

    def _run_job(self, job: TemplateJob, max_iterations: int, max_model_calls: int, claude_model: str | None, claude_base_url: str | None) -> None:
        stop_heartbeat = threading.Event()
        cancelled = threading.Event()
        lease_thread = threading.Thread(
            target=self._keep_lease_alive,
            args=(job.id, stop_heartbeat, cancelled),
            daemon=True,
        )
        lease_thread.start()
        try:
            result = self._run_visual_repair(job, max_iterations, max_model_calls, claude_model, claude_base_url, cancelled)
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

    def _run_visual_repair(self, job: TemplateJob, max_iterations: int, max_model_calls: int, claude_model: str | None, claude_base_url: str | None, cancelled: threading.Event) -> JobResult:
        if job.job_type != "visual_repair":
            return JobResult(status="failed", error="不支持的节点任务类型")
        raise_if_cancelled(cancelled)
        html, css = job.source_html, job.source_css
        iterations: list[dict[str, object]] = []
        previous_score: int | None = None
        stop_reason = "max_iterations_reached"
        model_calls = 0
        started = time.monotonic()
        for iteration in range(max_iterations):
            raise_if_cancelled(cancelled)
            rendered = self._repairer.render(html, css, job=job, cancel_event=cancelled)
            score = self._repairer.diagnostic_score(rendered)
            if score == 0:
                stop_reason = "visual_check_passed"
                break
            if previous_score is not None and score >= previous_score:
                stop_reason = "no_visual_improvement"
                break
            if model_calls + 2 > max_model_calls:
                stop_reason = "model_call_budget_exhausted"
                break
            diagnosis = self._repairer.diagnose(job.model_copy(update={"source_html": html, "source_css": css}), rendered, cancel_event=cancelled)
            model_calls += 1
            edit_job = job.model_copy(update={"source_html": html, "source_css": css, "diagnostics": json.dumps({"renderer": rendered.diagnostics, "mai": diagnosis}, ensure_ascii=False)})
            edited = self._editor.edit(edit_job, model=claude_model, base_url=claude_base_url, cancel_event=cancelled)
            model_calls += 1
            iterations.append({"iteration": iteration + 1, "diagnosis": diagnosis, "input_sha256": self._repairer._source_hash(html, css), "output_sha256": self._repairer._source_hash(edited.source_html, edited.source_css), "diagnostic_score": score, "elapsed_ms": round((time.monotonic() - started) * 1000), "agent": edited.report})
            html, css = edited.source_html, edited.source_css
            previous_score = score
        final_render = self._repairer.render(html, css, job=job, cancel_event=cancelled)
        if self._repairer.diagnostic_score(final_render) == 0:
            stop_reason = "visual_check_passed"
        return JobResult(
            status="succeeded",
            source_html=html,
            source_css=css,
            report={"stop_reason": stop_reason, "model_calls": model_calls, "iterations": iterations, "final_diagnostics": final_render.diagnostics, "elapsed_ms": round((time.monotonic() - started) * 1000)},
        )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    TemplateAgent(Settings()).run_forever()
