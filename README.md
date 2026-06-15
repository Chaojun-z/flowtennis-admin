# FlowTennis · 网球兄弟管理系统

校区管理、学员管理、排课管理、教练视角。

## 当前目录身份

- 正式开发目录：`/Users/shaobaolu/Desktop/FlowTennis/flowtennis-mgmt-main`
- 可信基线：`origin/main`
- 历史 worktree 只允许取证和差异比对，不再用于开发、验收、上传。

## 技术架构

- **前端**：单页 HTML（`public/index.html`）
- **后端**：Vercel Serverless Function（`api/index.js`）
- **数据库**：阿里云 TableStore，生产实例为 `flowtennis-ue`

## 部署

推送到 GitHub 后 Vercel 自动部署。

## 环境变量（Vercel 控制台配置）

- `TS_ENDPOINT` — TableStore 公网地址
- `TS_INSTANCE` — 生产环境为 `flowtennis-ue`，必须显式配置，禁止默认旧实例
- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `JWT_SECRET` — 只在 Vercel 环境变量中配置，禁止写入代码或文档明文
- `DIAG_TOKEN` — 诊断接口访问令牌，用于 `/api/diag` 和 `/api/match-diag`
- `ALLOWED_ORIGINS` — 允许访问 API 的前端域名，生产默认 `https://www.flowtennis.cn`
