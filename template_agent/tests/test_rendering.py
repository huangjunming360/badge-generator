import json
import subprocess
import threading
import unittest
from unittest.mock import Mock, patch

from template_agent.cancellation import JobCancelled
from template_agent.rendering import IsolatedRenderer, RenderError


class IsolatedRendererTest(unittest.TestCase):
    def test_render_uses_a_network_isolated_read_only_container(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps({
                "screenshot_png_base64": "cG5n",
                "diagnostics": {"overflow_x": False, "overflow_y": False},
            }).encode(),
            stderr=b"",
        )
        renderer = IsolatedRenderer("badge-template-renderer:test", 60)

        with patch("template_agent.rendering.subprocess.run", return_value=completed) as run:
            result = renderer.render("<article></article>", ".badge{}", width_mm=55, height_mm=85)

        command = run.call_args.args[0]
        self.assertIn("--network", command)
        self.assertEqual("none", command[command.index("--network") + 1])
        self.assertIn("--read-only", command)
        self.assertIn("--cap-drop", command)
        self.assertIn("ALL", command)
        self.assertIn("no-new-privileges:true", command)
        payload = json.loads(run.call_args.kwargs["input"])
        self.assertEqual({"width_mm": 55, "height_mm": 85}, {key: payload[key] for key in ("width_mm", "height_mm")})
        self.assertEqual("data:image/png;base64,cG5n", result.screenshot_data_url)

    def test_invalid_renderer_output_is_not_trusted(self) -> None:
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=b"{}", stderr=b"")
        renderer = IsolatedRenderer("badge-template-renderer:test", 60)

        with patch("template_agent.rendering.subprocess.run", return_value=completed):
            with self.assertRaises(RenderError):
                renderer.render("<article></article>", ".badge{}", width_mm=55, height_mm=85)

    def test_cancellation_terminates_an_inflight_renderer_container(self) -> None:
        renderer = IsolatedRenderer("badge-template-renderer:test", 60)
        cancelled = threading.Event()
        process = Mock(returncode=None)
        process.poll.return_value = None

        def communicate(*, input=None, timeout=None):
            if input is not None:
                cancelled.set()
                raise subprocess.TimeoutExpired([ "docker" ], timeout)
            return b"", b""

        process.communicate.side_effect = communicate
        with patch("template_agent.rendering.subprocess.Popen", return_value=process):
            with self.assertRaises(JobCancelled):
                renderer.render("<article></article>", ".badge{}", width_mm=55, height_mm=85, cancel_event=cancelled)

        process.terminate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
