"""Small MAI-UI adapter. It only receives already-isolated screenshots."""

import json
import queue
import threading
import time
from hashlib import sha256
from dataclasses import dataclass

from openai import OpenAI

from .config import Settings
from .cancellation import raise_if_cancelled
from .contracts import TemplateJob
from .rendering import IsolatedRenderer, RenderResult


class VisualRepairError(RuntimeError):
    pass


@dataclass(frozen=True)
class RepairResult:
    source_html: str
    source_css: str
    report: dict[str, object]


class MaiVisualRepairer:
    def __init__(self, settings: Settings, renderer: IsolatedRenderer) -> None:
        self._settings = settings
        self._renderer = renderer
        self._client = self._new_client()
        self._client_closed = False

    def _new_client(self) -> OpenAI:
        return OpenAI(
            base_url=str(self._settings.mai_base_url),
            api_key="local-not-used",
            timeout=getattr(self._settings, "mai_request_timeout_seconds", 30),
        )

    def _active_client(self) -> OpenAI:
        if self._client_closed:
            self._client = self._new_client()
            self._client_closed = False
        return self._client

    def repair(self, job: TemplateJob, max_iterations: int, cancel_event: threading.Event | None = None) -> RepairResult:
        html, css = job.source_html, job.source_css
        iterations: list[dict[str, object]] = []
        started_at = time.monotonic()
        timeout_seconds = getattr(self._settings, "visual_repair_timeout_seconds", 600)
        previous_score: int | None = None
        stop_reason = "max_iterations_reached"
        final_render: RenderResult | None = None
        for iteration in range(max_iterations):
            raise_if_cancelled(cancel_event)
            if time.monotonic() - started_at >= timeout_seconds:
                stop_reason = "time_budget_exhausted"
                break
            rendered = self._renderer.render(html, css, width_mm=job.width_mm, height_mm=job.height_mm, cancel_event=cancel_event)
            final_render = rendered
            score = self._diagnostic_score(rendered)
            audit = {
                "iteration": iteration + 1,
                "input_sha256": self._source_hash(html, css),
                "diagnostics": rendered.diagnostics,
                "diagnostic_score": score,
            }
            if score == 0:
                stop_reason = "visual_check_passed"
                break
            if previous_score is not None and score >= previous_score:
                stop_reason = "no_visual_improvement"
                break
            iterations.append(audit)
            raise_if_cancelled(cancel_event)
            html, css, notes = self._ask_mai(job, html, css, rendered, cancel_event=cancel_event)
            raise_if_cancelled(cancel_event)
            audit["notes"] = notes
            audit["output_sha256"] = self._source_hash(html, css)
            audit["elapsed_ms"] = round((time.monotonic() - started_at) * 1000)
            previous_score = score

        # Never trust a model's claim of success. Render the final candidate
        # once more even after a clean pass and record that measured result.
        final_render = self._renderer.render(html, css, width_mm=job.width_mm, height_mm=job.height_mm, cancel_event=cancel_event)
        if self._diagnostic_score(final_render) == 0:
            stop_reason = "visual_check_passed"
        return RepairResult(
            source_html=html,
            source_css=css,
            report={
                "stop_reason": stop_reason,
                "iterations": iterations,
                "final_diagnostics": final_render.diagnostics,
                "elapsed_ms": round((time.monotonic() - started_at) * 1000),
            },
        )

    @staticmethod
    def _needs_another_pass(rendered: RenderResult) -> bool:
        diagnostics = rendered.diagnostics
        return bool(
            diagnostics.get("overflow_x")
            or diagnostics.get("overflow_y")
            or diagnostics.get("console_errors")
            or diagnostics.get("overlaps")
            or diagnostics.get("low_contrast_text")
            or diagnostics.get("low_resolution_images")
        )

    @classmethod
    def _diagnostic_score(cls, rendered: RenderResult) -> int:
        diagnostics = rendered.diagnostics
        return sum(
            len(value) if isinstance(value, list) else int(bool(value))
            for value in (
                diagnostics.get("overflow_x"), diagnostics.get("overflow_y"),
                diagnostics.get("console_errors"), diagnostics.get("overlaps"),
                diagnostics.get("low_contrast_text"), diagnostics.get("low_resolution_images"),
            )
        )

    @staticmethod
    def _source_hash(html: str, css: str) -> str:
        return sha256(f"{html}\0{css}".encode("utf-8")).hexdigest()

    def ready(self) -> bool:
        try:
            self._active_client().models.list()
        except Exception:
            return False
        return True

    def _ask_mai(self, job: TemplateJob, html: str, css: str, rendered: RenderResult, *, cancel_event: threading.Event | None = None) -> tuple[str, str, str]:
        instruction = {
            "task": "修复固定尺寸名牌模板的视觉问题",
            "requirement": job.requirement,
            "reference_notes": job.reference_notes,
            "semantic_fields": job.semantic_fields,
            "diagnostics": [job.diagnostics, rendered.diagnostics],
            "complexity": job.complexity,
            "html": html,
            "css": css,
            "response_schema": {"html": "string", "css": "string", "notes": "string"},
            "constraints": [
                "只返回 JSON 对象，不要代码围栏或解释",
                "不使用 script、iframe、form、input、meta、link、外部 URL、CSS url() 或 @import",
                "保留 Liquid 变量，不新增无法验证的变量",
                "修复溢出、重叠、对比度与可读性，保持固定尺寸布局",
                "先根据截图检查实际视觉结果；若版式已清晰且无问题，保持现有结构，不要为了装饰而重写模板",
                "所有文字区域都应可伸缩，长姓名和单位不能重叠、越界或缩小到不可读",
            ],
        }
        response_queue: queue.Queue[object] = queue.Queue(maxsize=1)

        def request() -> None:
            try:
                response_queue.put(self._active_client().chat.completions.create(
                    model=self._settings.mai_model,
                    temperature=0,
                    max_tokens=4096,
                    messages=[
                        {"role": "system", "content": "你是受约束的 HTML/CSS 视觉修复器。"},
                        {"role": "user", "content": [
                            {"type": "text", "text": json.dumps(instruction, ensure_ascii=False)},
                            {"type": "image_url", "image_url": {"url": rendered.screenshot_data_url}},
                        ]},
                    ],
                ))
            except Exception as error:
                response_queue.put(error)

        thread = threading.Thread(target=request, daemon=True)
        thread.start()
        while thread.is_alive():
            thread.join(timeout=0.2)
            if cancel_event and cancel_event.is_set():
                self._client.close()
                self._client_closed = True
                raise_if_cancelled(cancel_event)
        response = response_queue.get()
        if isinstance(response, Exception):
            raise VisualRepairError("MAI 请求失败") from response
        content = response.choices[0].message.content or ""
        return self._parse_response(content)

    def _parse_response(self, content: str) -> tuple[str, str, str]:
        text = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            data = json.loads(text)
            html = data["html"]
            css = data["css"]
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise VisualRepairError("MAI 未返回有效模板 JSON") from error
        if not isinstance(html, str) or not isinstance(css, str):
            raise VisualRepairError("MAI 返回的模板字段不是字符串")
        if len(html.encode()) > 100 * 1024 or len(css.encode()) > 100 * 1024:
            raise VisualRepairError("MAI 返回的模板过大")
        return html, css, str(data.get("notes", ""))
