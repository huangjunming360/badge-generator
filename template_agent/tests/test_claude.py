import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from template_agent.claude import AgentEditError, ClaudeTemplateEditor
from template_agent.contracts import TemplateJob


class ClaudeTemplateEditorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SimpleNamespace(claude_model=None, claude_max_turns=6)
        self.job = TemplateJob(
            id="job-1",
            lease_token="lease",
            job_type="visual_repair",
            complexity=4,
            source_html="<article>{{ card.name }}</article>",
            source_css=".badge { color: #123; }",
        )

    def test_returns_only_the_two_workspace_outputs(self) -> None:
        editor = ClaudeTemplateEditor(self.settings)

        def edit_files(workspace: Path, _job: TemplateJob, **_kwargs: object) -> None:
            (workspace / "template.html").write_text("<article>edited</article>", encoding="utf-8")
            (workspace / "template.css").write_text(".badge{color:#000}", encoding="utf-8")

        editor._run_agent = Mock(side_effect=edit_files)
        result = editor.edit(self.job)

        self.assertEqual("<article>edited</article>", result.source_html)
        self.assertEqual(".badge{color:#000}", result.source_css)
        self.assertEqual(["template.css", "template.html"], result.report["workspace_files"])

    def test_rejects_output_larger_than_the_template_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "template.html"
            path.write_text("x" * (100 * 1024 + 1), encoding="utf-8")

            with self.assertRaises(AgentEditError):
                ClaudeTemplateEditor._read_output(path)

    def test_prompt_includes_exact_fixed_dimensions(self) -> None:
        prompt = ClaudeTemplateEditor._prompt(self.job)

        self.assertIn("55mm 宽 × 85mm 高", prompt)
        self.assertIn("template.html", prompt)
        self.assertIn("template.css", prompt)

    def test_rejects_a_terminal_agent_error_result(self) -> None:
        class FailedMessages:
            def __aiter__(self):
                return self

            async def __anext__(self):
                if getattr(self, "sent", False):
                    raise StopAsyncIteration
                self.sent = True
                return SimpleNamespace(is_error=True, errors=["认证失败"])

        import asyncio

        with self.assertRaisesRegex(AgentEditError, "认证失败"):
            asyncio.run(ClaudeTemplateEditor._consume(FailedMessages()))

    def test_sdk_receives_only_the_file_edit_toolset(self) -> None:
        editor = ClaudeTemplateEditor(self.settings)

        async def finished():
            if False:
                yield None

        with tempfile.TemporaryDirectory() as directory:
            with patch("claude_agent_sdk.query", return_value=finished()) as query:
                editor._run_agent(Path(directory), self.job)

        options = query.call_args.kwargs["options"]
        self.assertEqual(["Read", "Write", "Edit"], options.tools)
        self.assertEqual(["Read", "Write", "Edit"], options.allowed_tools)
        self.assertIn("Bash", options.disallowed_tools)
        self.assertIn("PreToolUse", options.hooks)

    def test_node_local_key_and_control_plane_endpoint_are_passed_only_to_sdk(self) -> None:
        self.settings.claude_api_key = Mock(get_secret_value=Mock(return_value="node-only-key"))
        self.settings.claude_base_url = None
        editor = ClaudeTemplateEditor(self.settings)

        async def finished():
            if False:
                yield None

        with tempfile.TemporaryDirectory() as directory:
            with patch("claude_agent_sdk.query", return_value=finished()) as query:
                editor._run_agent(Path(directory), self.job, model="claude-haiku-test", base_url="https://anthropic.example.test")

        options = query.call_args.kwargs["options"]
        self.assertEqual("claude-haiku-test", options.model)
        self.assertEqual("https://anthropic.example.test", options.env["ANTHROPIC_BASE_URL"])
        self.assertEqual("node-only-key", options.env["ANTHROPIC_API_KEY"])


if __name__ == "__main__":
    unittest.main()
