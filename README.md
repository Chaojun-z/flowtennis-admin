# FlowTennis · 网球兄弟管理系统

校区管理、学员管理、排课管理、教练视角。

## 技术架构

- **前端**：单页 HTML（`public/index.html`）
- **后端**：Vercel Serverless Function（`api/index.js`）
- **数据库**：阿里云 TableStore（华北2北京）

## 部署

推送到 GitHub 后 Vercel 自动部署。

## 环境变量（Vercel 控制台配置）

- `TS_ENDPOINT` — TableStore 公网地址
- `TS_INSTANCE` — `flowtennis`
- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `JWT_SECRET` — `flowtennis-jwt-2026`
