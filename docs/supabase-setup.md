# Northstar OKR：Supabase 与阿里云上线手册

## 1. 上线边界

上线分为两个独立变更：Supabase 数据层与阿里云静态站点。先在本地通过全部测试，再应用数据库迁移，最后部署同一 Git commit 的前端。不要把 service-role key、数据库密码或用户 JWT 放进前端、GitHub、Nginx 配置或日志。

本项目目标 Supabase project ref 为 `eomesxviqudmowgwftnn`。执行 `supabase link`、`supabase db push` 或覆盖阿里云站点前，必须再次确认目标、迁移列表、备份与回滚点。

## 2. 创建并配置 Supabase

1. 在 Supabase 创建项目，记录 Project URL 与 publishable/anon key；数据库密码只交给 CLI/安全密码库。
2. 在 Authentication → URL Configuration 设置生产 Site URL，并加入本地 `http://localhost:5173` 与生产回调 URL。不要使用宽泛通配符。
3. 本仓库迁移会创建私有 `report-attachments` bucket、10 MiB 限制、允许的 MIME、RLS、Storage policy 和受限 RPC；不要手工改成 public bucket。
4. 本地验证：

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

预期：3 个 pgTAP 文件、113 项数据库测试全部通过，lint 为零错误。

## 3. 精确迁移闸门

只允许按顺序应用以下文件：

1. `supabase/migrations/202608130001_core_schema.sql`
2. `supabase/migrations/202608130002_security.sql`
3. `supabase/migrations/202608130003_storage.sql`

获明确批准后才运行：

```bash
npx supabase login
npx supabase link --project-ref eomesxviqudmowgwftnn
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
npx supabase db lint --linked
```

`--dry-run` 输出必须只包含上述三个迁移；若远端有未预期迁移、目标 ref 不同或 lint 失败，立即停止。

## 4. 环境与构建

阿里云服务器仅需要构建期公开变量：

```dotenv
VITE_APP_MODE=supabase
VITE_SUPABASE_URL=https://eomesxviqudmowgwftnn.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

```bash
npm ci
npm run verify:config
npm run test:run
npm run typecheck
npm run build
```

将 `dist/` 原子切换到 Nginx 站点目录；SPA 必须配置 `try_files $uri $uri/ /index.html`。保留上一个 release 目录和当前 commit SHA，失败时把软链接切回上一版本并 reload Nginx。不要在服务器直接 `git pull` 覆盖正在服务的目录。

## 5. RLS、Auth 与附件验收

- 未登录请求不能读取业务表；无组织/项目分配的 profile 显示未分配状态。
- 五种授权角色分别核对导航、日报正文、工时字段、风险和设置边界。
- HR、未授权人员与越级关系看不到附件文件名、数量、路径或 URL。
- 附件 bucket 保持 private；仅允许 PDF、Office、CSV、PNG/JPEG、TXT，单文件不超过 10 MiB。
- 下载先调用授权 RPC，再生成 60 秒签名 URL；DOM 和日志不出现原始 storage path。
- 创建/编辑日报、冲突处理、修订历史、上传/重试/替换/移除/下载逐项冒烟。

## 6. 免费计划、保留、备份与升级

Supabase 套餐配额会变化，上线前在官方 Dashboard 核对当前数据库、Storage、带宽、Auth 和备份限制。免费计划不应被视为具备生产 SLA 或完整时间点恢复。

- 每日监控数据库/Storage/出口流量；达到当前套餐 70% 时预警，85% 时暂停非必要大文件上传并评估升级。
- 定期清理已软删除、失败和长期 pending 的附件对象；先按 metadata 对账，禁止仅按路径批量删除。
- 上线迁移前做可恢复备份并实际演练恢复；业务所需保留期写入组织政策。
- 需要更长备份保留、PITR、更高容量或生产 SLA 时先升级套餐，再提高业务负载。

## 7. 上线后检查与回滚

检查生产首页、深层路由、登录/退出、五角色权限、RLS 拒绝、日报修订和私有附件。数据库迁移是向前迁移：发现问题先关闭写入口/回滚前端，再使用经过演练的恢复或补丁迁移；不要手工删表或回退 migration history。
