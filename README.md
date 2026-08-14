# Northstar OKR

一个中文优先、可即时切换 English 的企业 OKR 应用，提供角色化仪表盘、真实 KR 进度历史、风险事件矩阵与执行状态解释、结构化日报、修订历史，以及由 Supabase RLS 和私有 Storage 保护的附件。

用户操作与权限说明见[中文用户指南](docs/user-guide.zh-CN.md)和[English user guide](docs/user-guide.en.md)。

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

## 演示方式与真实写入

顶栏的“演示角色”切换器仅在 `demo` 模式中可用，可在管理员、管理层、项目负责人、员工和 HR 五种模拟身份间切换。每种角色会看到其权限范围内的仪表盘和导航；当路由权限被拒绝时，应用会显示不泄露资源信息的通用访问受限页面。顶栏的“中文 / English”可即时切换界面语言，首次访问默认中文。

员工在 Supabase 模式可通过“更新我的 KR”写入自己负责 KR 的不可变实际进度记录；可通过“新增风险”把具体风险事件关联到自己负责的 KR 或目标。项目负责人可管理其项目中的风险。风险事件的矩阵严重度与 OKR 执行状态不同；详见用户指南的计算规则。HR 不具备通用风险管理权限，员工和 HR 的项目列表不会显示未授权项目的元数据。

## 安全边界

演示模式的菜单、路由和按钮控制只用于体验；Supabase 模式由数据库 RLS、受限 RPC 和 Storage policy 对每次读取和写入重新鉴权。管理员默认不能读取机密业务正文；OKR 摘要、日报正文、证据和附件是独立权限资源。项目不包含 AI 功能。

## 验证

```bash
npm run verify:config
npm test -- --run scripts/verify-supabase-config.test.mjs
npm run test:run
npm run typecheck
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
```

## 数据与部署

演示模式的数据只保存在当前页面内存；它不是对真实持久化的证明。Supabase 与阿里云部署、备份、清理和上线闸门见 [Supabase 部署手册](docs/supabase-setup.md)。生产构建必须使用 `VITE_APP_MODE=supabase` 并运行生产校验：

```bash
VITE_APP_MODE=supabase \
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY \
node scripts/verify-supabase-config.mjs --production
```

生产构建输出到 `dist/`，可由 Nginx 作为 SPA 静态站点托管。未获明确批准前，不要执行 `supabase db push` 或覆盖线上站点。
