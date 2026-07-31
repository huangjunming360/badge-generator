from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration is injected by Docker/WSL, never committed to the repository."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEMPLATE_AGENT_")

    server_url: HttpUrl
    node_id: str
    node_token: SecretStr
    poll_interval_seconds: int = 15
    request_timeout_seconds: int = 30

    # vLLM remains local to the GPU host. The Rails server never receives this URL.
    mai_base_url: HttpUrl = "http://127.0.0.1:18000/v1"
    mai_model: str = "MAI-UI-8B"
    renderer_image: str = "badge-template-renderer:local"
    renderer_timeout_seconds: int = 60
    lease_heartbeat_seconds: int = 30

    # Authentication is owned by Claude Agent SDK on the GPU node. This is
    # intentionally separate from the Rails node token.
    claude_model: str | None = None
    claude_base_url: HttpUrl | None = None
    claude_api_key: SecretStr | None = None
    claude_max_turns: int = 6
