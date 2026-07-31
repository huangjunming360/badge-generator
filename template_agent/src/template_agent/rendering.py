"""Run untrusted template markup in a disposable, network-isolated browser."""

import base64
import json
import subprocess
import threading
import time
from dataclasses import dataclass

from .cancellation import raise_if_cancelled


class RenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderResult:
    screenshot_data_url: str
    diagnostics: dict[str, object]


class IsolatedRenderer:
    def __init__(self, image: str, timeout_seconds: int) -> None:
        self._image = image
        self._timeout_seconds = timeout_seconds

    def render(self, html: str, css: str, *, width_mm: int, height_mm: int, cancel_event: threading.Event | None = None) -> RenderResult:
        payload = json.dumps(
            {"html": html, "css": css, "width_mm": width_mm, "height_mm": height_mm},
            ensure_ascii=False,
        ).encode()
        command = [
            "docker", "run", "--rm", "-i",
            "--network", "none",
            "--read-only",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges:true",
            "--pids-limit", "128",
            "--memory", "1g",
            "--cpus", "1.0",
            "--shm-size", "256m",
            self._image,
        ]
        try:
            if cancel_event is None:
                completed = subprocess.run(
                    command, input=payload, capture_output=True, check=True,
                    timeout=self._timeout_seconds,
                )
                stdout = completed.stdout
            else:
                process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                deadline = time.monotonic() + self._timeout_seconds
                first_input = payload
                try:
                    while True:
                        raise_if_cancelled(cancel_event)
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise subprocess.TimeoutExpired(command, self._timeout_seconds)
                        try:
                            stdout, stderr = process.communicate(input=first_input, timeout=min(0.2, remaining))
                            break
                        except subprocess.TimeoutExpired:
                            first_input = None
                except BaseException:
                    if process.returncode is None:
                        process.terminate()
                        try:
                            process.communicate(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.communicate()
                    raise
                if process.returncode:
                    raise subprocess.CalledProcessError(process.returncode, command, output=stdout, stderr=stderr)
            output = json.loads(stdout.decode("utf-8"))
            screenshot = output["screenshot_png_base64"]
            return RenderResult(
                screenshot_data_url=f"data:image/png;base64,{screenshot}",
                diagnostics=output["diagnostics"],
            )
        except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RenderError("渲染器返回了无效结果") from error
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as error:
            raise RenderError("隔离渲染器执行失败") from error

    def ready(self) -> bool:
        try:
            subprocess.run(
                ["docker", "image", "inspect", self._image],
                capture_output=True, check=True, timeout=10,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
            return False
        return True
