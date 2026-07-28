# frozen_string_literal: true

# 解析进度跟踪。把进度存内存缓存，前端轮询。
class ProgressTracker
  STAGES = {
    uploading: "上传文件中…",
    mineru: "MinerU 解析文档中…",
    extracting: "AI 提取字段中…",
    portrait: "识别大头照…",
    done: "完成",
    error: "解析失败"
  }.freeze

  def initialize(task_id)
    @task_id = task_id
  end

  def set(stage, message = nil)
    data = {
      stage: stage,
      message: message || STAGES[stage] || stage.to_s,
      updated_at: Time.current.iso8601
    }
    Rails.cache.write("progress:#{@task_id}", data, expires_in: 5.minutes)
  end

  def get
    Rails.cache.read("progress:#{@task_id}") || { stage: :pending, message: "等待中…" }
  end

  def done
    set(:done)
  end

  def error(msg)
    set(:error, msg)
  end

  # 生成一个唯一的任务 ID
  def self.generate_id
    SecureRandom.hex(12)
  end
end
