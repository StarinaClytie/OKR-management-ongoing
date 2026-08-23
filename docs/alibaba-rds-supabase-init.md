# 瞬谱光电 OKR — 全新阿里云 RDS Supabase 初始化方案

本文描述把 OKR 项目从旧 Supabase Cloud 切换到**全新的阿里云 RDS Supabase**（Supabase 自托管于阿里云 ECS、PostgreSQL 使用阿里云 RDS）时，如何**只部署结构（schema / RLS / function / trigger / storage）**，**不迁移任何旧业务数据**。

> 安全红线：`service_role` key、JWT secret、数据库密码、`DATABASE_URL` 只能存在于服务端（Edge Functions 环境变量、Supabase CLI 环境、密码库）。它们**绝不**进入前端、Git、Nginx 配置或日志。前端只使用浏览器公开的 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。

---

## 1. 现状（本仓库已具备的结构）

所有数据库对象都由 `supabase/migrations/` 里的 SQL 定义，部署迁移即可在新实例上完整重建，无需任何手工建表。结构清单：

### 1.1 表（全部位于 `public`）

| 域 | 表 |
|---|---|
| 组织与账号 | `organizations`、`profiles`、`user_roles`、`reporting_lines` |
| 项目 | `projects`、`project_members`、`collaboration_links` |
| 目标 | `objectives` |
| 关键结果 | `key_results`、`kr_assignments`、`kr_progress_updates`、`progress_snapshots`、`progress_baselines` |
| 里程碑/风险 | `milestones`、`risks`、`legacy_project_risks` |
| 日报/周报 | `daily_reports`、`daily_report_revisions`、`daily_report_revision_krs`、`daily_objectives`、`daily_key_results`、`daily_okr_blocks`、`report_evidence_links`、`report_attachments`、`report_attachment_revisions`、`daily_report_upload_sessions` |
| 资源与补给 | `resources`、`resource_attachments`、`resource_problems`、`resource_problem_notifications` |

### 1.2 枚举类型（`public.*`）

`app_role`、`classification`、`report_status`、`approval_status`、`kr_measurement_type`、`okr_status`、`kr_metric_type`、`okr_priority`、`kr_assignment_role`、`project_status`、`risk_level`、`resource_category`、`resource_kind`、`attachment_state`、`resource_status`、`resource_problem_type`、`resource_problem_status`、`resource_notification_status`。

### 1.3 数据库函数

- **公开 RPC**：所有写操作均为 `SECURITY DEFINER` RPC（如 `create_project`、`create_objective`、`create_key_result`、`update_key_result`、`save_kr_progress_update`、`approve_pending_user`、`set_user_active`、`begin_attachment_upload`、`create_attachment_download`、`list_organization_users`、`list_projects` 等）。日报附件以 `begin_daily_report_upload_session` 开始，经 `begin_entry_attachment_upload` / `finalize_attachment_upload` 上传并校验，以 session-aware `save_daily_report` 提交；同日编辑还使用 `adopt_daily_report_revision_attachments`。
- **私有辅助函数**：`private.*`，包含权限判定（`has_role`、`is_project_leader`、`is_project_member`、`has_clearance`、`can_read_business_subject`、`can_read_report_detail`、`is_eligible_kr_owner`、`is_eligible_project_assignee` 等）。

### 1.4 触发器

- `set_*_updated_at`（维护 `updated_at`）。
- 不可变保护触发器：`reject_kr_progress_update_mutation`、`reject_progress_snapshot_mutation`、`prevent_daily_report_revision_mutation`、`prevent_daily_report_revision_kr_mutation`、`assert_risk_subject_project`、`assert_daily_report_revision_pointer`。

### 1.5 索引 / 外键

- 主键、唯一约束与复合外键全部由迁移定义（含 `(organization_id, id)` 复合唯一键、跨表 `on delete restrict/cascade/set null` 语义，用于保留历史归因）。
- 显式二级索引包括 `projects_organization_status_idx`、`project_members_profile_id_idx`、`resources_*` 系列、`resource_problems_*`、`resource_problem_notifications_problem_idx`。

### 1.6 RLS 策略

- 所有业务表均 `ENABLE` + `FORCE ROW LEVEL SECURITY`。
- 读策略按五角色模型收敛：`Management → 组织业务可见`、`Project Leader → 所领导项目/成员`、`Employee → 项目同级 + 自有 KR`、`Administrator → 系统/用户管理`、`HR → 仅工作量视图`。
- `profiles_read`、`roles_read` 为最小化策略；目录读取经 `list_organization_users()`（SECURITY DEFINER）提供。

### 1.7 Storage

- 两个**私有** bucket（`public=false`），由迁移直接 `insert into storage.buckets` 创建：
  - `report-attachments`（10 MiB，PDF/Office/CSV/PNG/JPEG/TXT）。
  - `resource-documents`（资源附件）。
- `storage.objects` 的 RLS 策略（insert/select/delete）经 `private.can_insert_attachment_object` 等授权函数校验，附件只能经授权 RPC 上传/下载，不暴露原始 path。

---

## 2. 迁移清单与历史原则

`supabase/migrations/` 是唯一迁移清单。文件名前缀决定顺序；部署前用 `npx supabase migration list` 对比本地与远端历史，不在文档中维护容易过期的手工数量或文件副本。

本次日报附件生命周期发布必须按顺序包含以下三个 additive migration：

1. `202608230006_daily_upload_sessions_and_locks.sql`：上传 session、服务端终态校验、上海业务日及审核锁定。
2. `202608230007_daily_attachment_adoption.sql`：同日编辑的历史附件继承、可重试的 session 清理 RPC。
3. `202608230008_daily_upload_cleanup_session_recovery.sql`：刷新后恢复仍有未关联清理目标的 active session。

> 只追加新迁移；**不要**编辑、重命名、回退或重新执行远端已经记录的迁移，也不要手工删表。生产升级只允许本次发布审批过的迁移处于 pending 状态。

---

## 3. 部署结构到新 RDS Supabase

### 3.1 通过 Supabase CLI（唯一受支持的迁移方式）

前提：新实例可用 `supabase link` 连接（自托管需在 `supabase/config.toml` 之外提供连接信息，或用 `--db-url`）。

`DATABASE_URL` 形如 `postgresql://postgres:<密码>@<rds-host>:5432/postgres`，只能从服务端密码库注入当前 shell；不要写入命令历史、仓库、前端或日志。以下命令必须在待发布 commit 的仓库根目录执行。

#### 步骤 A：迁移历史与只读预检

```bash
# 同时查看 Local / Remote；保存输出到受控的发布记录，禁止包含连接串。
npx supabase migration list --db-url "$DATABASE_URL"

# 只读确认目标库、关键表和现有 RPC；任何 unexpected null 都先停下排查。
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
select current_database(), current_user;
select to_regclass('public.daily_reports') as daily_reports,
       to_regclass('public.report_attachments') as report_attachments;
select to_regprocedure('public.create_key_result(uuid,text,uuid[],date,public.kr_metric_type,numeric,numeric,text,text,numeric,public.okr_priority,public.classification)') as create_kr_rpc,
       to_regprocedure('public.save_daily_report(date,public.report_status,public.classification,jsonb,jsonb)') as save_report_rpc;
SQL
```

对 `migration list` 逐行核对：远端已记录的版本必须与仓库历史一致；只有发布单列出的新增 migration 可以显示为 pending。出现未知远端版本、已应用文件内容漂移或额外 pending 文件时，停止部署并先对账，不能用 `migration repair` 猜测修复。

#### 步骤 B：dry-run 并核对待执行集合

```bash
npx supabase db push --dry-run --db-url "$DATABASE_URL"
```

dry-run 输出必须只包含发布单审批的 migration 文件。输出为空表示无需迁移；出现任何额外文件或 destructive SQL 时停止。不要继续使用 `psql -f` 或 shell 循环直接执行迁移：那会绕过 Supabase migration history，导致下次部署无法可靠判断已应用版本。

#### 步骤 C：历史记录式执行

```bash
npx supabase db push --db-url "$DATABASE_URL"
```

`db push` 成功后才算迁移已应用并记录到远端历史。不要用 `--include-all` 掩盖历史分叉。

#### 步骤 D：迁移后验证与 PostgREST schema reload

```bash
npx supabase migration list --db-url "$DATABASE_URL"
npx supabase db lint --db-url "$DATABASE_URL"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'report_attachments'
  and column_name in ('display_name', 'upload_session_id')
order by column_name;

select to_regclass('public.daily_report_upload_sessions') as upload_sessions,
       to_regclass('public.report_attachment_revisions') as attachment_revisions;

select to_regprocedure('public.begin_daily_report_upload_session(date,public.report_status,public.classification)') as begin_session_rpc,
       to_regprocedure('public.begin_entry_attachment_upload(uuid,uuid,integer,text,text,integer,public.classification,text)') as begin_upload_rpc,
       to_regprocedure('public.finalize_attachment_upload(uuid,text)') as finalize_upload_rpc,
       to_regprocedure('public.save_daily_report(date,public.report_status,public.classification,jsonb,uuid,jsonb)') as save_report_rpc,
       to_regprocedure('public.adopt_daily_report_revision_attachments(uuid,uuid,uuid[])') as adopt_rpc,
       to_regprocedure('public.list_daily_report_upload_session_cleanup(uuid)') as cleanup_list_rpc;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.daily_report_upload_sessions'::regclass,
              'public.report_attachments'::regclass);

select pg_notify('pgrst', 'reload schema');
SQL
```

再次确认 `migration list` 的本地/远端版本完全对齐。`pg_notify` 成功只说明通知已发送；还必须从 PostgREST 公网 API 用受控真实账号调用一个新 RPC，确认 schema cache 已更新。若自托管 PostgREST 未监听 `pgrst` 通知，按 ECS 编排流程滚动重启 PostgREST 服务；不要重启数据库。全新实例也走同一 `db push` 历史流程，随后运行本地/隔离环境 pgTAP；**不导入任何旧业务数据**。

---

## 4. Auth 兼容性（注册 / 登录 / session / 角色绑定）

本系统使用标准 Supabase Auth（GoTrue），在自托管 Supabase 上同样可用。流程：

1. 用户自助注册 → `auth.users` 建账号。
2. 前端调用 `public.create_pending_profile()` 生成 `approval_status='pending'`、无角色的 profile。
3. 管理员在审批流程中调用 `public.approve_pending_user()` 原子化地写入角色并置为 `approved`。

需要在**新实例的 Supabase Dashboard / Auth 配置**里手工确认：

- **Email provider**：启用 email/password signup（与 `supabase/config.toml` 的 `enable_signup = true` 一致），按需关闭 email confirmation。
- **Site URL**：设为生产站点（如 `https://okr.groupmeeting.xyz`）。
- **Redirect URLs**：加入生产回调 URL 与本地 `http://localhost:5173`（不要用通配符）。
- **JWT secret**：自托管需确保 GoTrue 与 PostgREST 使用同一 JWT secret（部署时注入，前端绝不可见）。

角色绑定完全由数据库 `user_roles` 表 + RPC 完成，与 Auth provider 解耦，因此切换到自托管 Supabase 后无需改代码。

---

## 5. Storage 兼容性

- 两个私有 bucket 由迁移自动创建，**无需手工建 bucket**，也不要改成 public。
- `storage.objects` 的 RLS 策略依赖 `auth.uid()` 与 `storage.buckets` 表，自托管 Storage 服务需与 Auth 共用同一 JWT 才能让策略生效。
- 日报附件上传从服务端 session 开始，经 `begin_entry_attachment_upload` 领取受限 path，浏览器通过 `https://api.okr.trspectra.com/storage/v1/...` 上传，再由 `finalize_attachment_upload` 核对 Storage metadata。下载仍走 `create_attachment_download` 与 signed URL，**不需要迁移旧附件**。
- 前端只需绑定 `api.okr.trspectra.com` 这个 Supabase API 入口；**不需要、也不应该把 OSS bucket 域名或 OSS AccessKey 绑到/注入前端**。OSS endpoint、bucket 凭据和跨域策略是自托管 Storage 服务的服务端配置；生产 bundle 不得包含内部 RDS 主机名或 OSS 凭据。

### 5.1 生产残留清理边界

正常取消/刷新恢复由前端按 `list_daily_report_upload_session_cleanup` → `delete_daily_report_upload_attachment` → Storage DELETE → `abandon_daily_report_upload_session` 顺序完成。不要定时清理 active session，因为它可能正在上传，也可能在刷新后恢复。

如果确需生产人工清理，只处理超过已审批保留期、`status='abandoned'` 的 session 中，同时满足 `state='pending'`、`revision_id is null` 且 `daily_okr_block_id is null` 的**未关联**附件。先用以下只读查询生成受控候选清单：

```sql
select session.id as session_id,
       attachment.id as attachment_id,
       attachment.storage_path,
       session.abandoned_at,
       exists (
         select 1 from storage.objects object
         where object.bucket_id = 'report-attachments'
           and object.name = attachment.storage_path
       ) as storage_object_exists
from public.daily_report_upload_sessions session
join public.report_attachments attachment
  on attachment.upload_session_id = session.id
 and attachment.organization_id = session.organization_id
 and attachment.report_id = session.report_id
where session.organization_id = '<approved-organization-uuid>'::uuid
  and session.status = 'abandoned'
  and session.abandoned_at < '<approved-cutoff-timestamptz>'::timestamptz
  and attachment.state = 'pending'
  and attachment.revision_id is null
  and attachment.daily_okr_block_id is null
order by session.abandoned_at, attachment.id;
```

候选中如果 `storage_object_exists=true`，必须先经受控的 Supabase Storage API 按**完全匹配的 path**删除对象并复查；不要直接删 `storage.objects` 记录。对已确认无 Storage 对象的同一批次，可在变更单附带的显式 organization/cutoff 边界内将 metadata 软删除：

```sql
begin;

with approved_candidates as (
  select attachment.id
  from public.daily_report_upload_sessions session
  join public.report_attachments attachment
    on attachment.upload_session_id = session.id
   and attachment.organization_id = session.organization_id
   and attachment.report_id = session.report_id
  where session.organization_id = '<approved-organization-uuid>'::uuid
    and session.status = 'abandoned'
    and session.abandoned_at < '<approved-cutoff-timestamptz>'::timestamptz
    and attachment.state = 'pending'
    and attachment.revision_id is null
    and attachment.daily_okr_block_id is null
    and not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'report-attachments'
        and object.name = attachment.storage_path
    )
)
update public.report_attachments attachment
set state = 'deleted'
from approved_candidates candidate
where attachment.id = candidate.id
returning attachment.id, attachment.upload_session_id;

-- 核对 returning 行数与已批准清单完全一致后才 COMMIT，否则 ROLLBACK。
rollback;
```

首次演练保留 `rollback`；只有返回集与审批清单完全一致后，才在变更窗口把最后一行改为 `commit`。绝不处理 active/completed session、已终态上传、已关联 revision/block 的附件，或审核后日报的证据。

---

## 6. Edge Functions 部署

两个函数需部署到新实例，并配置服务端环境变量：

| 函数 | 依赖的环境变量（服务端，非前端） |
|---|---|
| `admin-delete-user` | `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（Edge Runtime 自动注入） |
| `resource-problem-notify` | 同上 + `RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`RESOURCE_APP_URL`（默认 `https://okr.groupmeeting.xyz`） |

```bash
npx supabase functions deploy admin-delete-user
npx supabase functions deploy resource-problem-notify
```

`config.toml` 已对两个函数设置 `verify_jwt = true`。

---

## 7. 首个管理员 / 初始角色数据

仓库**没有** `supabase/seed.sql`，也没有自动 seed。全新实例需要一个初始组织与管理员。建议：

1. 在 Dashboard 里通过 email/password 注册第一个账号。
2. 用一次性的 SQL（仅服务端、手动、受控）建立组织 + 管理员，或临时用 `service_role` 调用 `create_pending_profile` + `approve_pending_user`：

```sql
-- 一次性引导（把 <uuid> 换成真实 auth 用户 id）
insert into public.organizations (id, name) values (gen_random_uuid(), '<组织名>');
-- 然后用管理员 RPC 或直接插入 user_roles 赋予 administrator 角色
```

此后其余用户走正常审批流程，不再需要手工插入。

---

## 8. 前端生产环境配置

浏览器只读取三个公开变量（见 `.env.production.example`）：

```dotenv
VITE_APP_MODE=supabase
VITE_SUPABASE_URL=https://api.okr.trspectra.com
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

- `.env.production` 已加入 `.gitignore`，真实值只存在于构建服务器/受保护 CI 环境。
- `build:production` 会先跑 `verify-supabase-config.mjs --production`，拒绝占位值、service-role/secret key、非 HTTPS URL。
- 构建后用 `rg -a 'https://api\.okr\.trspectra\.com' dist` 确认公开 API 域名已入包，并用 `rg -a -i 'rds\.aliyuncs\.com|rm-[a-z0-9-]+\..*aliyuncs\.com' dist` 确认内部 RDS 主机名为零匹配。任何命中都停止发布。

### 8.1 上线后只读验证

除了 RPC 存在性和 RLS 检查，还应记录以下不包含凭据的聚合结果：

```sql
select status, count(*)
from public.daily_report_upload_sessions
group by status
order by status;

select count(*) as invalid_session_attachment_links
from public.report_attachments attachment
join public.daily_report_upload_sessions session
  on session.id = attachment.upload_session_id
where attachment.organization_id <> session.organization_id
   or attachment.report_id <> session.report_id
   or attachment.uploader_id <> session.author_id;

select count(*) as associated_deleted_attachments
from public.report_attachments
where state = 'deleted'
  and (revision_id is not null or daily_okr_block_id is not null);
```

`invalid_session_attachment_links` 必须为 0。`associated_deleted_attachments` 若非 0，先核对是否为合法的历史软删除，不得自动清理。业务 QA 仅使用已批准的测试组织、测试账号和无敏感附件；不使用生产员工资料。

### 8.2 回滚与紧急止血

这三个数据库迁移是 additive/forward-only，且旧的无 session 写 RPC 已撤销 `authenticated` 权限。**不要** drop 新表/列、删除 migration history，也不要为了回滚前端重新开放旧 RPC；那会恢复残留 pending 和越过锁定的路径。

- 前端回滚只能回到与 session-aware RPC 签名兼容的已审核构建。
- 若需要立即止血，先撤销新日报写 RPC 的 `authenticated` 执行权限，使日报暂时只读，再 reload PostgREST。该操作必须有变更审批：

```sql
begin;
revoke execute on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) from authenticated;
revoke execute on function public.begin_entry_attachment_upload(uuid, uuid, integer, text, text, integer, public.classification, text) from authenticated;
revoke execute on function public.finalize_attachment_upload(uuid, text) from authenticated;
revoke execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) from authenticated;
revoke execute on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) from authenticated;
revoke execute on function public.delete_daily_report_upload_attachment(uuid) from authenticated;
revoke execute on function public.abandon_daily_report_upload_session(uuid) from authenticated;
select pg_notify('pgrst', 'reload schema');
commit;
```

修复并重新验证后，用对称的 `grant execute ... to authenticated` 恢复上述精确签名，再次 `pg_notify`。如果问题需要改变数据库结构或函数实现，必须新建已审核的 forward migration，不直接改已应用文件。

---

## 9. 验收清单

- `npm ci && npm run typecheck && npm run test:run` 全绿。
- `npm run build:production`（注入真实 URL/anon key）通过。
- 新实例：注册→登录→session→管理员审批→角色绑定端到端可用。
- 附件上传/下载、两个私有 bucket、RLS 拒绝项逐项冒烟。
- 结构迁移后 `supabase db lint` 零错误。

日报附件发布的角色化手工 QA 门禁：

1. Employee 和 Project Leader 各自在当日日报选择一个无敏感小文件；确认选择后立即上传，且进度条/百分比可观测。
2. 在等待、上传中、服务器校验中、失败或删除中的任一状态，“提交日报”必须为原生 disabled；仅在所有附件服务端终态校验完成并显示 100% 后可提交。
3. 提交成功后 reload，确认内容、工时、附件及显示名均持久化；在同一上海业务日编辑，保留或删除历史附件后再次提交并 reload 核对。
4. Management 确认该报告后，Employee reload 必须同步看到已确认/已锁定，编辑入口消失；直接调用任何 save/finalize/abandon/delete RPC 也必须被数据库拒绝。
5. 使用前一上海业务日的报告重复锁定验证；无论状态是否 confirmed，都不得编辑或新建上传 session。
