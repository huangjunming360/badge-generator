"""Constrained Claude Agent SDK pass for template source edits.

Claude only receives a fresh temporary directory containing the two source
files. It cannot invoke a shell, network tool, sub-agent, or write any other
path. The output contract is consequently file based rather than free-form
model JSON.
"""

import asyncio
import os
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Settings
from .cancellation import JobCancelled, raise_if_cancelled
from .contracts import TemplateJob


class AgentEditError(RuntimeError):
    pass


@dataclass(frozen=True)
class AgentEditResult:
    source_html: str
    source_css: str
    report: dict[str, object]


class ClaudeTemplateEditor:
    """Run Claude in a two-file workspace and return only those file contents."""

    _ALLOWED_FILENAMES = frozenset({"template.html", "template.css"})
    _DISALLOWED_TOOLS = [
        "Bash",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
        "Task",
        "NotebookEdit",
    ]

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def edit(self, job: TemplateJob, *, model: str | None = None, base_url: str | None = None, cancel_event: threading.Event | None = None) -> AgentEditResult:
        raise_if_cancelled(cancel_event)
        with tempfile.TemporaryDirectory(prefix="badge-template-agent-") as directory:
            workspace = Path(directory).resolve()
            html_path = workspace / "template.html"
            css_path = workspace / "template.css"
            html_path.write_text(job.source_html, encoding="utf-8")
            css_path.write_text(job.source_css, encoding="utf-8")

            self._run_agent(workspace, job, model=model, base_url=base_url, cancel_event=cancel_event)
            raise_if_cancelled(cancel_event)
            html = self._read_output(html_path)
            css = self._read_output(css_path)

        return AgentEditResult(
            source_html=html,
            source_css=css,
            report={"agent": "claude", "workspace_files": sorted(self._ALLOWED_FILENAMES)},
        )

    def _run_agent(self, workspace: Path, job: TemplateJob, *, model: str | None = None, base_url: str | None = None, cancel_event: threading.Event | None = None) -> None:
        try:
            from claude_agent_sdk import ClaudeAgentOptions, HookMatcher, query
        except ImportError as error:
            raise AgentEditError("未安装 Claude Agent SDK；请重新执行 pip install '.[visual]'") from error

        async def only_template_outputs(input_data: dict[str, Any], tool_use_id: str, context: Any) -> dict[str, object]:
            del tool_use_id, context
            requested = input_data.get("tool_input", {}).get("file_path", "")
            try:
                candidate = Path(requested)
                output_path = (candidate if candidate.is_absolute() else workspace / candidate).resolve()
                permitted = output_path.parent == workspace and output_path.name in self._ALLOWED_FILENAMES
            except (OSError, TypeError):
                permitted = False
            if permitted:
                return {}
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "只允许编辑 template.html 与 template.css",
                }
            }

        options_kwargs: dict[str, Any] = {
            "cwd": str(workspace),
            # `tools` removes every other built-in tool from the agent's
            # available toolset. `allowed_tools` then auto-approves these
            # three only; the hook enforces their exact output paths.
            "tools": ["Read", "Write", "Edit"],
            "allowed_tools": ["Read", "Write", "Edit"],
            "disallowed_tools": self._DISALLOWED_TOOLS,
            "permission_mode": "acceptEdits",
            "max_turns": self._settings.claude_max_turns,
            "system_prompt": (
                "你是名牌模板的受限编辑器。只能读取和编辑 template.html 与 template.css。"
                "不得使用外部资源、脚本、网络、命令或创建其他文件。"
            ),
            "hooks": {
                "PreToolUse": [
                    HookMatcher(matcher="Write|Edit", hooks=[only_template_outputs]),
                ],
            },
        }
        selected_model = model or getattr(self._settings, "claude_model", None)
        if selected_model:
            options_kwargs["model"] = selected_model

        # The API key remains in this node's environment. Rails can select a
        # configured model/endpoint, but never sees or transports the secret.
        agent_env = os.environ.copy()
        local_base_url = getattr(self._settings, "claude_base_url", None)
        configured_base_url = base_url or (str(local_base_url) if local_base_url else None)
        if configured_base_url:
            agent_env["ANTHROPIC_BASE_URL"] = configured_base_url
        local_api_key = getattr(self._settings, "claude_api_key", None)
        if local_api_key:
            agent_env["ANTHROPIC_API_KEY"] = local_api_key.get_secret_value()
        options_kwargs["env"] = agent_env

        prompt = self._prompt(job)
        try:
            asyncio.run(self._consume(query(prompt=prompt, options=ClaudeAgentOptions(**options_kwargs)), cancel_event))
        except JobCancelled:
            raise
        except AgentEditError:
            raise
        except Exception as error:
            raise AgentEditError("Claude Agent 模板编辑失败") from error

    @staticmethod
    async def _consume(messages: Any, cancel_event: threading.Event | None = None) -> None:
        # A CLI transport may end normally while reporting a failed agent run.
        # Do not accept the unchanged files as a successful generated result.
        iterator = messages.__aiter__()
        pending: asyncio.Task[Any] | None = None
        try:
            while True:
                raise_if_cancelled(cancel_event)
                pending = asyncio.create_task(iterator.__anext__())
                while True:
                    try:
                        message = await asyncio.wait_for(asyncio.shield(pending), timeout=0.2)
                        break
                    except TimeoutError:
                        raise_if_cancelled(cancel_event)
                if getattr(message, "is_error", False):
                    details = getattr(message, "errors", None) or []
                    detail = str(details[0]) if details else "未提供详情"
                    raise AgentEditError(f"Claude Agent 未完成模板编辑：{detail}")
                pending = None
        except StopAsyncIteration:
            return
        except JobCancelled:
            if pending and not pending.done():
                pending.cancel()
            closer = getattr(messages, "aclose", None)
            if closer:
                await closer()
            raise

    @staticmethod
    def _read_output(path: Path) -> str:
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise AgentEditError("Claude Agent 没有保留可读取的模板输出") from error
        if len(content.encode("utf-8")) > 100 * 1024:
            raise AgentEditError("Claude Agent 模板输出过大")
        return content

    @staticmethod
    def _prompt(job: TemplateJob) -> str:
        return f"""编辑当前名牌模板，使其满足以下需求。必须直接修改 template.html 和 template.css；不要在回复中输出代码。

成品固定尺寸：{job.width_mm}mm 宽 × {job.height_mm}mm 高。
需求：{job.requirement or "保持现有设计意图并改善可读性。"}
已知问题：{job.diagnostics or "无。"}
视觉复杂度：{job.complexity}/10。

规则：
- 保留已有 Liquid 变量，不得臆造字段；所有文字空间应容纳长姓名和组织名称。
- HTML 只能是普通展示标签；禁止 script、iframe、form、input、meta、link 和外部 URL。
- CSS 禁止 url() 与 @import；不得把画布尺寸撑开。
- 只编辑这两个已存在的文件。完成后停止。"""
