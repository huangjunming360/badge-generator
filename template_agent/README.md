# 家庭 GPU 模板节点（Python）

节点运行在 Windows 的 WSL2 Ubuntu 中。它主动通过 ZeroTier 私网向 Rails 心跳和领取任务，因此不需要端口映射，也不会接触浏览器 Cookie 或用户登录会话。

该目录已经包含可运行的私有节点：Rails 持久化租约、Python 轮询、MAI 视觉修复和一次性 Playwright 沙箱。节点不会接触浏览器 Cookie、用户密码、数据库或宿主机桌面。

## 下载 MAI-UI-8B

模型是约 8.77B 的 BF16 权重，官方推荐用 vLLM 服务。下载前在 WSL2 中确认 Hugging Face 网络可用；如果 Windows 的系统代理没有传入 WSL，需要显式设置 `HTTPS_PROXY` 或 `HF_ENDPOINT`。

先验证 WSL、Docker 和 NVIDIA Container Toolkit 都能看到 4090。下面两条都成功后再下载模型：

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -U huggingface_hub
HF_ENDPOINT=https://huggingface.co \
  huggingface-cli download Tongyi-MAI/MAI-UI-8B \
  --revision e00a0097abb9cc621cac5172d8c4809f0839c94e \
  --local-dir models/MAI-UI-8B \
  --local-dir-use-symlinks False
```

这里的代理只用于这条下载命令，不会修改系统代理设置。当前 revision 已固定为
`e00a0097abb9cc621cac5172d8c4809f0839c94e`；下载后应保留校验记录，运行时不允许模型容器联网。

## 启动 vLLM

```bash
docker compose -f docker-compose.yml up -d mai-vllm
curl --fail http://127.0.0.1:18000/v1/models
```

vLLM 只绑定 WSL 本机的 `127.0.0.1:18000`，不会直接暴露到 ZeroTier 或公网。Python 节点控制器在 WSL 主机上运行，访问 `http://127.0.0.1:18000/v1`。

## 构建隔离渲染器

在 WSL2 中构建一次本地渲染镜像：

```bash
docker build -t badge-template-renderer:local ./renderer
```

每个任务都会执行一次 `docker run --rm`。渲染容器禁网、只读根文件系统、无 Linux capabilities、无特权、无宿主目录挂载，也没有 Docker socket。它只从标准输入接收当前模板，并只向标准输出返回截图与尺寸诊断。

## 启动节点

Python 节点必须在 WSL 主机运行，而不是容器内运行。这样它可调用 Docker CLI 创建上述受限的一次性容器，同时节点本身不需要 Docker socket 挂载。

节点要求 Python 3.11 或更新版本；Ubuntu 22.04 的默认 Python 可能较旧，先安装对应解释器和 venv 支持：

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv
```

```bash
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install '.[visual]'
cp .env.example .env
badge-template-agent
```

节点每 15 秒向 Rails 主动心跳。空闲时不访问 MAI；收到 `visual_repair` 任务才会处理。单任务最多 3 轮：渲染截图 -> MAI 诊断/修复 -> 再渲染。截图只停留在本机进程内，不上传 Rails。

不接 GPU 也可以先运行节点单元测试，验证容器隔离参数、MAI 响应解析与多轮修复控制逻辑：

```bash
python -m unittest discover -s tests -v
```

## 必需环境变量

```dotenv
TEMPLATE_AGENT_SERVER_URL=https://your-zero-tier-rails-host
TEMPLATE_AGENT_NODE_ID=home-4090
TEMPLATE_AGENT_NODE_TOKEN=replace-with-node-secret
```

`TEMPLATE_AGENT_NODE_TOKEN` 是节点专用密钥，不是 Rails 登录密码，也不应写入仓库。

## Rails 端一次性准备

在 Rails 服务器执行迁移后，创建节点凭据。命令会只打印一次明文 token；Rails 数据库只保存 bcrypt hash。

```bash
bin/rails runner 'node = GpuNode.find_or_initialize_by(node_key: "home-4090"); token = SecureRandom.urlsafe_base64(32); node.assign_attributes(name: "Home 4090", active: true, token: token); node.save!; puts "TEMPLATE_AGENT_NODE_ID=#{node.node_key}"; puts "TEMPLATE_AGENT_NODE_TOKEN=#{token}"'
```

把输出填入 WSL 的 `.env`。节点通过 ZeroTier 地址访问 Rails，例如 `http://10.x.x.x:8000`；不要开放 vLLM 的 18000 端口，也不要将节点暴露到公网。

管理员随后可调用 `POST /api/v1/admin/badge_templates/:id/enqueue_visual_repair`，传入 `version_id`、`complexity`、`diagnostics` 和 `requirement` 创建任务。任务结果先保存在队列记录中，永远不会自动发布或覆盖模板版本，必须经人工审核后才创建新版本。
