import threading


class JobCancelled(RuntimeError):
    """Raised when the Rails control plane revokes the active job."""


def raise_if_cancelled(cancel_event: threading.Event | None) -> None:
    if cancel_event and cancel_event.is_set():
        raise JobCancelled("任务已由用户取消")
