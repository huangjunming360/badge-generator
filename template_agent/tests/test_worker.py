import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from template_agent.cancellation import JobCancelled
from template_agent.contracts import TemplateJob
from template_agent.worker import TemplateAgent


class TemplateAgentCancellationTest(unittest.TestCase):
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
            agent._run_visual_repair(job, 200, None, None, cancelled)

        agent._editor.edit.assert_not_called()
        agent._repairer.repair.assert_not_called()
