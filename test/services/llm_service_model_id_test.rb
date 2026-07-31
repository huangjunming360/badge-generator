require "test_helper"

# 分离架构下模型由请求参数指定（无 cookie session），
# 这里验证 model_id 的优先级与未知 id 的处理。
class LlmServiceModelIdTest < ActiveSupport::TestCase
  class FakeChat
    attr_reader :schema, :temperature

    def with_instructions(*) = self
    def with_params(**) = self
    def add_message(**) = self

    def with_temperature(value)
      @temperature = value
      self
    end

    def with_schema(schema)
      @schema = schema
      self
    end

    def complete
      Struct.new(:content).new({ "ok" => true })
    end
  end

  MODELS = {
    "default" => "model_a",
    "models" => [
      { "id" => "model_a", "label" => "A", "api" => "anthropic", "model" => "m-a" },
      { "id" => "model_b", "label" => "B", "api" => "openai", "model" => "m-b" }
    ]
  }.freeze

  def with_models(&)
    original = Rails.application.config.x.models
    Rails.application.config.x.models = MODELS
    yield
  ensure
    Rails.application.config.x.models = original
  end

  def with_functions(functions)
    original = Rails.application.config.x.llm_functions
    Rails.application.config.x.llm_functions = functions
    yield
  ensure
    Rails.application.config.x.llm_functions = original
  end

  def config_of(**kwargs)
    LlmService.new(**kwargs).instance_variable_get(:@config)
  end

  test "指定 model_id 时用该模型" do
    with_models do
      assert_equal "m-b", config_of(model_id: "model_b")["model"]
    end
  end

  test "model_id 优先于 session" do
    with_models do
      session = { selected_model: MODELS["models"].first }
      assert_equal "m-b", config_of(session: session, model_id: "model_b")["model"]
    end
  end

  test "未指定时回落到默认模型" do
    with_models do
      assert_equal "m-a", config_of["model"]
    end
  end

  test "未知的 model_id 报错而不是静默用默认模型" do
    with_models do
      # 静默回落会让用户以为换了模型其实没换
      error = assert_raises(LlmService::UnknownModel) { config_of(model_id: "nope") }
      assert_match(/未知的模型/, error.message)
    end
  end

  test "function 选择配置中的模型和参数" do
    with_models do
      with_functions(
        "template_design" => {
          "model" => "model_b",
          "prompt" => "设计",
          "max_tokens" => 123,
          "temperature" => 0
        }
      ) do
        service = LlmService.new(function: :template_design)
        assert_equal "m-b", service.instance_variable_get(:@config)["model"]
        assert_equal "设计", service.function_prompt
        assert_equal 123, service.function_max_tokens
        assert_equal 0, service.function_temperature
      end
    end
  end

  test "显式 model_id 优先于 function 默认模型" do
    with_models do
      with_functions("template_design" => { "model" => "model_b" }) do
        assert_equal "m-a", config_of(function: :template_design, model_id: "model_a")["model"]
      end
    end
  end

  test "未知 function 报错" do
    with_functions({}) do
      assert_raises(LlmService::UnknownFunction) { LlmService.new(function: :missing) }
    end
  end

  test "结构化输出 schema 会交给客户端并保留 Hash 响应" do
    schema = {
      "name" => "check",
      "schema" => {
        "type" => "object",
        "properties" => { "ok" => { "type" => "boolean" } },
        "required" => [ "ok" ],
        "additionalProperties" => false
      }
    }
    chat = FakeChat.new
    original = RubyLLM.method(:chat)
    RubyLLM.define_singleton_method(:chat) { |**| chat }

    with_models do
      result = LlmService.new(model_id: "model_b").complete(
        [ { role: "user", content: "检查" } ],
        schema: schema
      )

      assert_equal schema, chat.schema
      assert_equal 0, chat.temperature
      assert_equal({ "ok" => true }, result)
    end
  ensure
    RubyLLM.define_singleton_method(:chat, original) if original
  end
end
