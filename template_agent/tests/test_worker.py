import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from template_agent.claude import AgentEditError
from template_agent.cancellation import JobCancelled
from template_agent.contracts import TemplateJob
from template_agent.worker import TemplateAgent
from template_agent.rendering import RenderResult


class TemplateAgentCancellationTest(unittest.TestCase):
    def test_probe_reports_selected_model_status_without_returning_a_key(self) -> None:
        agent = TemplateAgent.__new__(TemplateAgent)
        agent._settings = SimpleNamespace(claude_model=None, claude_base_url=None)
        agent._desired_config = SimpleNamespace(
            claude_model_id="agent-sonnet",
            claude_model="claude-sonnet-test",
            claude_base_url="https://anthropic.example.test",
        )
        agent._probe_signature = None
        agent._probe_ready = False
        agent._probe_error = None
        agent._probe_retry_at = 0.0
        agent._editor = Mock()

        model_id, ready, error = agent._probe_agent_model()

        self.assertEqual("agent-sonnet", model_id)
        self.assertTrue(ready)
        self.assertIsNone(error)
        agent._editor.probe.assert_called_once_with(
            model="claude-sonnet-test", base_url="https://anthropic.example.test",
        )

    def test_probe_failure_prevents_job_claiming_and_is_rate_limited(self) -> None:
        agent = TemplateAgent.__new__(TemplateAgent)
        agent._settings = SimpleNamespace(claude_model=None, claude_base_url=None)
        agent._desired_config = SimpleNamespace(
            claude_model_id="agent-fail",
            claude_model="claude-invalid",
            claude_base_url=None,
        )
        agent._probe_signature = None
        agent._probe_ready = False
        agent._probe_error = None
        agent._probe_retry_at = 0.0
        agent._editor = Mock()
        agent._editor.probe.side_effect = AgentEditError("Claude Agent 模型探测失败：认证、模型名或协议不可用")

        first = agent._probe_agent_model()
        second = agent._probe_agent_model()

        self.assertEqual("agent-fail", first[0])
        self.assertFalse(first[1])
        self.assertIn("协议不可用", first[2] or "")
        self.assertEqual(first, second)
        agent._editor.probe.assert_called_once()

    def test_cancelled_job_does_not_start_claude_or_mai(self) -> None:
        agent = TemplateAgent.__new__(TemplateAgent)
        agent._editor = Mock()
        agent._repairer = Mock()
        cancelled = threading.Event()
        cancelled.set()
        job = TemplateJob(
            id="job-1",
            lease_token="lease",
            job_type="visual_repair",
            complexity=4,
            source_html="<article></article>",
            source_css=".badge{}",
        )

        with self.assertRaises(JobCancelled):
            agent._run_visual_repair(job, 200, 400, None, None, cancelled)

        agent._editor.edit.assert_not_called()
        agent._repairer.repair.assert_not_called()

    def test_model_call_budget_stops_before_starting_a_new_repair_round(self) -> None:
        agent = TemplateAgent.__new__(TemplateAgent)
        agent._editor = Mock()
        agent._repairer = Mock()
        agent._repairer.render.return_value = RenderResult("data:image/png;base64,x", {"overflow_y": True})
        agent._repairer.diagnostic_score.return_value = 1
        job = TemplateJob(
            id="job-budget", lease_token="lease", job_type="visual_repair", complexity=4,
            source_html="<article></article>", source_css=".badge{}",
        )

        result = agent._run_visual_repair(job, 200, 1, None, None, threading.Event())

        self.assertEqual("model_call_budget_exhausted", result.report["stop_reason"])
        self.assertEqual(0, result.report["model_calls"])
        agent._repairer.diagnose.assert_not_called()
        agent._editor.edit.assert_not_called()
