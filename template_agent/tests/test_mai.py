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
        self.assertEqual("visual_check_passed", result.report["stop_reason"])
        self.assertIn("input_sha256", result.report["iterations"][0])
        self.assertIn("output_sha256", result.report["iterations"][0])

    def test_clean_initial_render_skips_mai_and_stops_immediately(self) -> None:
        renderer = Mock()
        renderer.render.side_effect = [
            RenderResult("data:image/png;base64,one", {}),
            RenderResult("data:image/png;base64,two", {}),
        ]
        with patch("template_agent.mai.OpenAI"):
            repairer = MaiVisualRepairer(self.settings, renderer)
        repairer._ask_mai = Mock()

        result = repairer.repair(self.job, max_iterations=200)

        self.assertEqual("visual_check_passed", result.report["stop_reason"])
        self.assertEqual([], result.report["iterations"])
        repairer._ask_mai.assert_not_called()

    def test_stops_when_a_repair_does_not_reduce_visual_diagnostics(self) -> None:
        renderer = Mock()
        renderer.render.side_effect = [
            RenderResult("data:image/png;base64,one", {"overflow_y": True}),
            RenderResult("data:image/png;base64,two", {"overflow_y": True}),
            RenderResult("data:image/png;base64,three", {"overflow_y": True}),
        ]
        with patch("template_agent.mai.OpenAI"):
            repairer = MaiVisualRepairer(self.settings, renderer)
        repairer._ask_mai = Mock(return_value=("<article>unchanged</article>", ".badge{}", "no change"))

        result = repairer.repair(self.job, max_iterations=200)

        self.assertEqual("no_visual_improvement", result.report["stop_reason"])
        self.assertEqual(1, len(result.report["iterations"]))
        repairer._ask_mai.assert_called_once()

    def test_rejects_malformed_model_json(self) -> None:
        with patch("template_agent.mai.OpenAI"):
            repairer = MaiVisualRepairer(self.settings, Mock())

        with self.assertRaises(VisualRepairError):
            repairer._parse_response("not json")

    def test_visual_request_includes_field_contract_and_reference_notes(self) -> None:
        with patch("template_agent.mai.OpenAI") as openai:
            client = openai.return_value
            client.chat.completions.create.return_value = Mock(
                choices=[Mock(message=Mock(content='{"html":"<article></article>","css":"","notes":"ok"}'))]
            )
            repairer = MaiVisualRepairer(self.settings, Mock())
            job = self.job.model_copy(update={
                "reference_notes": "参考蓝色夏令营挂牌",
                "semantic_fields": [{"key": "name", "label": "姓名"}],
            })

            repairer._ask_mai(job, "<article></article>", ".badge{}", RenderResult("data:image/png;base64,x", {}))

        text = client.chat.completions.create.call_args.kwargs["messages"][1]["content"][0]["text"]
        self.assertIn("参考蓝色夏令营挂牌", text)
        self.assertIn('"semantic_fields"', text)

    def test_diagnosis_contract_contains_observations_without_source_code(self) -> None:
        with patch("template_agent.mai.OpenAI") as openai:
            client = openai.return_value
            client.chat.completions.create.return_value = Mock(
                choices=[Mock(message=Mock(content='{"issues":["标题溢出"],"recommendations":["增加文字空间"],"summary":"需要调整"}'))]
            )
            repairer = MaiVisualRepairer(self.settings, Mock())
            diagnosis = repairer.diagnose(self.job, RenderResult("data:image/png;base64,x", {"overflow_y": True}))

        self.assertEqual(["标题溢出"], diagnosis["issues"])
        self.assertNotIn("html", diagnosis)
        request = client.chat.completions.create.call_args.kwargs["messages"][1]["content"][0]["text"]
        self.assertIn("只返回 JSON 诊断", request)

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
