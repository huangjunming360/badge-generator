"""Small MAI-UI adapter. It only receives already-isolated screenshots."""

import json
from dataclasses import dataclass

from openai import OpenAI

from .config import Settings
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
        self._client = OpenAI(base_url=str(settings.mai_base_url), api_key="local-not-used")

    def repair(self, job: TemplateJob, max_iterations: int) -> RepairResult:
        html, css = job.source_html, job.source_css
        iterations: list[dict[str, object]] = []
        for iteration in range(max_iterations):
            rendered = self._renderer.render(html, css, width_mm=job.width_mm, height_mm=job.height_mm)
            if iteration > 0 and not self._needs_another_pass(rendered):
                break
            iterations.append({"iteration": iteration + 1, "diagnostics": rendered.diagnostics})
            html, css, notes = self._ask_mai(job, html, css, rendered)
            iterations[-1]["notes"] = notes

        final_render = self._renderer.render(html, css, width_mm=job.width_mm, height_mm=job.height_mm)
        return RepairResult(
            source_html=html,
            source_css=css,
            report={"iterations": iterations, "final_diagnostics": final_render.diagnostics},
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

    def ready(self) -> bool:
        try:
            self._client.models.list()
        except Exception:
            return False
        return True

    def _ask_mai(self, job: TemplateJob, html: str, css: str, rendered: RenderResult) -> tuple[str, str, str]:
        instruction = {
            "task": "修复固定尺寸名牌模板的视觉问题",
            "requirement": job.requirement,
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
        response = self._client.chat.completions.create(
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
        )
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
