import unittest
import threading
from types import SimpleNamespace
from unittest.mock import Mock, patch

from template_agent.contracts import TemplateJob
from template_agent.mai import MaiVisualRepairer, VisualRepairError
from template_agent.rendering import RenderResult


class MaiVisualRepairerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = SimpleNamespace(mai_base_url="http://127.0.0.1:18000/v1", mai_model="MAI-UI-8B")
        self.job = TemplateJob(
            id="job-1",
            lease_token="lease",
            job_type="visual_repair",
            complexity=6,
            source_html="<article>{{ card.name }}</article>",
            source_css=".badge { color: #123; }",
            width_mm=55,
            height_mm=85,
        )

    def test_stops_after_the_first_clean_re_render(self) -> None:
        renderer = Mock()
        renderer.render.side_effect = [
            RenderResult("data:image/png;base64,one", {"overflow_y": True}),
            RenderResult("data:image/png;base64,two", {}),
            RenderResult("data:image/png;base64,three", {}),
        ]
        with patch("template_agent.mai.OpenAI"):
            repairer = MaiVisualRepairer(self.settings, renderer)
        repairer._ask_mai = Mock(return_value=("<article>fixed</article>", ".badge{}", "fixed overflow"))

        result = repairer.repair(self.job, max_iterations=3)

        self.assertEqual("<article>fixed</article>", result.source_html)
        self.assertEqual(1, len(result.report["iterations"]))
        repairer._ask_mai.assert_called_once()
        self.assertEqual(3, renderer.render.call_count)

    def test_rejects_malformed_model_json(self) -> None:
        with patch("template_agent.mai.OpenAI"):
            repairer = MaiVisualRepairer(self.settings, Mock())

        with self.assertRaises(VisualRepairError):
            repairer._parse_response("not json")

    def test_rejects_oversized_model_output(self) -> None:
        with patch("template_agent.mai.OpenAI"):
            repairer = MaiVisualRepairer(self.settings, Mock())

        too_large = "x" * (100 * 1024 + 1)
        with self.assertRaises(VisualRepairError):
            repairer._parse_response('{"html":"' + too_large + '","css":""}')

    def test_cancellation_closes_an_inflight_local_mai_request(self) -> None:
        with patch("template_agent.mai.OpenAI") as openai:
            client = openai.return_value
            started = threading.Event()
            release = threading.Event()

            def slow_request(**_kwargs: object) -> object:
                started.set()
                release.wait(2)
                return Mock(choices=[Mock(message=Mock(content='{"html":"","css":""}'))])

            client.chat.completions.create.side_effect = slow_request
            repairer = MaiVisualRepairer(self.settings, Mock())
            cancelled = threading.Event()

            def cancel_after_start() -> None:
                started.wait(1)
                cancelled.set()

            stopper = threading.Thread(target=cancel_after_start)
            stopper.start()
            with self.assertRaisesRegex(RuntimeError, "用户取消"):
                repairer._ask_mai(self.job, "<article></article>", ".badge{}", RenderResult("data:image/png;base64,x", {}), cancel_event=cancelled)
            release.set()
            stopper.join(timeout=1)
            client.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
