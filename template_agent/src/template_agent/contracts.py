from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class NodeCapabilities(BaseModel):
    gpu_name: str | None = None
    vram_mb: int | None = Field(default=None, ge=0)
    mai_ready: bool = False
    renderer_ready: bool = False
    agent_version: str


class DesiredConfig(BaseModel):
    paused: bool = False
    max_iterations: int = Field(default=3, ge=1, le=200)
    max_concurrency: int = Field(default=1, ge=1, le=1)
    claude_model_id: str | None = None
    claude_model: str | None = None
    claude_base_url: str | None = None


class TemplateJob(BaseModel):
    id: str
    lease_token: str
    job_type: Literal["visual_repair"]
    requirement: str = ""
    diagnostics: str = ""
    complexity: int = Field(ge=1, le=10)
    source_html: str
    source_css: str
    width_mm: int = Field(default=55, ge=20, le=200)
    height_mm: int = Field(default=85, ge=20, le=200)


class HeartbeatRequest(BaseModel):
    capabilities: NodeCapabilities
    current_job_id: str | None = None
    sent_at: datetime


class HeartbeatResponse(BaseModel):
    desired_config: DesiredConfig
    cancel_current_job: bool = False
    job: TemplateJob | None = None


class JobResult(BaseModel):
    status: Literal["succeeded", "failed"]
    source_html: str | None = None
    source_css: str | None = None
    report: dict[str, object] = Field(default_factory=dict)
    error: str | None = None
