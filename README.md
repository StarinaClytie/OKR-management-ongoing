# Northstar OKR

一个中文优先的企业 OKR 应用，提供角色化仪表盘、结构化日报、计划进度、风险解释、修订历史，以及由 Supabase RLS 和私有 Storage 保护的附件。

## 本地运行

```bash
npm install
npm run dev
npm run test:run
npm run typecheck
npm run build
```

开发服务器启动后，按终端显示的本地地址打开应用。生产构建会输出到 `dist/`。

## 运行模式

复制 `.env.example` 为 `.env.local`，选择一种模式：

```dotenv
# 完全本地的模拟身份和数据
VITE_APP_MODE=demo

# 或真实 Supabase 身份、数据库和私有附件
VITE_APP_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

`demo` 不构造 Supabase 客户端，也不会上传数据；`supabase` 必须配置公开 URL 和 publishable/anon key。前端绝不能配置 service-role key 或数据库密码。

## 演示方式

顶栏的“演示角色”切换器可在管理员、管理层、项目负责人、员工和 HR 五种模拟身份间切换。每种角色会看到其权限范围内的仪表盘和导航；当路由权限被拒绝时，应用会显示访问受限页面。

项目负责人可以填写自己的结构化日报并审核成员日报；HR 只查看已授权工时字段，不展示日报正文或证据。项目视图提供对齐树、甘特图、进度趋势、风险矩阵和工作负载五个标签，支持键盘方向键切换。

## 安全边界

演示模式的菜单、路由和按钮控制只用于体验；Supabase 模式由数据库 RLS、受限 RPC 和 Storage policy 对每次读取和写入重新鉴权。管理员默认不能读取机密业务正文；OKR 摘要、日报正文、证据和附件是独立权限资源。项目不包含 AI 功能。

## 验证

```bash
npm run verify:config
npm run test:run
npm run typecheck
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
```

## 数据与部署

演示模式的数据只保存在当前页面内存。Supabase 与阿里云部署、备份、清理和上线闸门见 [Supabase 部署手册](docs/supabase-setup.md)。生产构建输出到 `dist/`，可由 Nginx 作为 SPA 静态站点托管。
