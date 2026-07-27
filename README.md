# newapp

FastAPI + SQLite 后端，React + Vite + Tailwind 前端。

## 环境

- Python 3.12.13（由 uv 管理，不动系统 3.10）
- Node v22.23.0 / npm 10.9.8
- SQLite 3.37.2（含 `sqlite3` 命令行）

## 后端

```bash
cd backend
uv sync                      # 装/同步依赖
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                # 测试
uv run ruff check . && uv run ruff format .
uv run mypy app
```

数据库文件 `backend/data/app.sqlite3`，启动时自动建表。表结构变更用 Alembic：

```bash
uv run alembic init -t async alembic     # 首次
uv run alembic revision --autogenerate -m "xxx"
uv run alembic upgrade head
```

## 前端

```bash
cd frontend
npm run dev      # http://localhost:5173，/api 代理到 8000
npm run build
```

## 说明

- CORS 与 Vite 代理都写死本地 5173/8000，上线前需改成真实域名。
- 当前 `/api/health` 无鉴权，是空骨架；加登录时再装 `python-jose` + `passlib[bcrypt]`。
