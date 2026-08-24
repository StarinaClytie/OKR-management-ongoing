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
| 日报/周报 | `daily_reports`、`daily_report_revisions`、`daily_report_revision_krs`、`daily_objectives`、`daily_key_results`、`daily_okr_blocks`、`daily_report_comments`、`report_evidence_links`、`report_attachments`、`report_attachment_revisions`、`daily_report_upload_sessions` |
| 资源与补给 | `resources`、`resource_attachments`、`resource_problems`、`resource_problem_notifications`、`user_notifications` |

### 1.2 枚举类型（`public.*`）

`app_role`、`classification`、`report_status`、`approval_status`、`kr_measurement_type`、`okr_status`、`kr_metric_type`、`okr_priority`、`kr_assignment_role`、`project_status`、`risk_level`、`resource_category`、`resource_kind`、`attachment_state`、`resource_status`、`resource_problem_type`、`resource_problem_status`、`resource_notification_status`、`user_notification_type`。

### 1.3 数据库函数

- **公开 RPC**：所有写操作均为 `SECURITY DEFINER` RPC（如 `create_project`、`create_objective`、`create_key_result`、`update_key_result`、`save_kr_progress_update`、`approve_pending_user`、`set_user_active`、`begin_attachment_upload`、`create_attachment_download`、`list_organization_users`、`list_projects` 等）。日报附件以 `begin_daily_report_upload_session` 和 session-aware `begin_entry_attachment_upload` 创建 OSS metadata，再由 authenticated 授权、Node 服务 OSS HEAD 校验、service-role confirmation 确认，最后以 session-aware `save_daily_report` 提交；同日编辑还使用 `adopt_daily_report_revision_attachments`。`finalize_attachment_upload` 已退休，必须持续拒绝 authenticated/anon/public，绝不可重新授权。
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

### 1.7 业务附件字节存储

- 本发布支持的生产 UI/API 流程会将所有新日报和资源附件字节写入同一个**私有** OSS bucket `timetech-okr-files`；日报使用 `organization/{organizationId}/reports/...`，资源使用 `organization/{organizationId}/resources/...`。PostgreSQL 生成路径、保存 metadata 并执行授权；Node 附件服务签名、HEAD 校验和删除对象。
- 浏览器通过同源 `/api/` 获得短时精确对象签名 URL，不得到 OSS AccessKey、service-role key、永久 URL 或自定义 OSS 域名。OSS bucket 不公开。
- 早期 `report-attachments` 和 `resource-documents` Supabase Storage bucket/schema 可能仍存在于迁移历史。它们不是受支持的生产附件路径，旧对象只是可丢弃测试数据：不迁移、不复制、不支持兼容下载。`202608240004` 撤销资源 Storage 入口，`202608240005` 移除日报 Storage 对象策略和 helper grants；两者共同阻断附件字节经 Storage 直接传输，同时保留 session-aware OSS metadata RPC。

---

## 2. 迁移清单与历史原则

`supabase/migrations/` 是唯一迁移清单。文件名前缀决定顺序；部署前用 `npx supabase migration list` 对比本地与远端历史，不在文档中维护容易过期的手工数量或文件副本。

本次发布必须按版本顺序包含以下 additive migration；其中前四个为日报附件生命周期，随后是资源访问、日报审核通知，以及两类附件迁移到 OSS：

1. `202608230006_daily_upload_sessions_and_locks.sql`：上传 session、服务端终态校验、上海业务日及审核锁定。
2. `202608230007_daily_attachment_adoption.sql`：同日编辑的历史附件继承、可重试的 session 清理 RPC。
3. `202608230008_daily_upload_cleanup_session_recovery.sql`：刷新后恢复仍有未关联清理目标的 active session。
4. `202608230009_daily_upload_review_hardening.sql`：补齐日报审核/上传工作流的权限加固。
5. `202608240001_resource_access.sql`：所有已批准、active 且有 active 角色的账号可发现/创建资源；创建者默认是负责人，可指定同组织合格负责人，并建立资源负责人通知。
6. `202608240002_report_review_notifications.sql`：日报详情、受限审核/评论、确认通知与通知中心已读状态。
7. `202608240003_daily_report_oss_storage.sql`：日报附件字节改为私有 OSS、增加服务端对象确认，并撤销旧 Storage 最终确认入口。
8. `202608240004_resource_attachment_oss_storage.sql`：资源附件字节改为同一私有 OSS bucket、最大 100 MiB、增加服务端对象确认，并撤销旧 Storage 入口。
9. `202608240005_daily_report_storage_lockdown.sql`：移除日报 Storage 对象 insert/read/delete 策略并撤销相关 helper grants，保留 session-aware OSS metadata 入口。

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
       to_regclass('public.report_attachment_revisions') as attachment_revisions,
       to_regclass('public.resource_attachments') as resource_attachments,
       to_regclass('public.daily_report_comments') as report_comments,
       to_regclass('public.user_notifications') as user_notifications;

select to_regprocedure('public.begin_daily_report_upload_session(date,public.report_status,public.classification)') as begin_session_rpc,
       to_regprocedure('public.begin_entry_attachment_upload(uuid,uuid,integer,text,text,integer,public.classification,text)') as begin_upload_rpc,
       to_regprocedure('public.save_daily_report(date,public.report_status,public.classification,jsonb,uuid,jsonb)') as save_report_rpc,
       to_regprocedure('public.adopt_daily_report_revision_attachments(uuid,uuid,uuid[])') as adopt_rpc,
       to_regprocedure('public.list_daily_report_upload_session_cleanup(uuid)') as cleanup_list_rpc,
       to_regprocedure('public.delete_daily_report_upload_attachment(uuid)') as cleanup_delete_rpc,
       to_regprocedure('public.abandon_daily_report_upload_session(uuid)') as abandon_session_rpc,
       to_regprocedure('public.soft_delete_attachment(uuid)') as soft_delete_rpc,
       to_regprocedure('public.authorize_attachment_revision_removal(uuid)') as authorize_revision_removal_rpc;

select to_regprocedure('public.list_resources(boolean)') as list_resources_rpc,
       to_regprocedure('public.list_eligible_resource_owners()') as eligible_resource_owners_rpc,
       to_regprocedure('public.create_resource(text,public.resource_category,public.resource_kind,text,text,date,text,text,text,text,numeric,text,uuid)') as create_resource_assigned_owner_rpc,
       to_regprocedure('public.get_daily_report_detail(uuid)') as report_detail_rpc,
       to_regprocedure('public.comment_daily_report(uuid,text)') as comment_report_rpc,
       to_regprocedure('public.confirm_daily_report(uuid,integer)') as confirm_report_rpc,
       to_regprocedure('public.list_my_notifications(integer,timestamp with time zone,uuid)') as notifications_rpc,
       to_regprocedure('public.mark_notification_read(uuid)') as notification_read_rpc,
       to_regprocedure('public.mark_all_notifications_read()') as notifications_read_all_rpc;

select to_regprocedure('public.authorize_attachment_object_upload(uuid)') as report_upload_authorize_rpc,
       to_regprocedure('public.confirm_attachment_object_upload(uuid,text,text,bigint)') as report_upload_confirm_rpc,
       to_regprocedure('public.authorize_resource_attachment_object_upload(uuid)') as resource_upload_authorize_rpc,
       to_regprocedure('public.confirm_resource_attachment_object_upload(uuid,text,text,bigint)') as resource_upload_confirm_rpc,
       to_regprocedure('public.authorize_resource_attachment_object_download(uuid)') as resource_download_authorize_rpc,
       to_regprocedure('public.request_resource_attachment_object_deletion(uuid)') as resource_delete_request_rpc,
       to_regprocedure('public.confirm_resource_attachment_object_deletion(uuid)') as resource_delete_confirm_rpc;

-- 每行必须是 function_exists=true 且 authenticated_execute=true。
with expected(signature) as (
  values
    ('public.begin_daily_report_upload_session(date,public.report_status,public.classification)'),
    ('public.begin_entry_attachment_upload(uuid,uuid,integer,text,text,integer,public.classification,text)'),
    ('public.save_daily_report(date,public.report_status,public.classification,jsonb,uuid,jsonb)'),
    ('public.adopt_daily_report_revision_attachments(uuid,uuid,uuid[])'),
    ('public.list_daily_report_upload_session_cleanup(uuid)'),
    ('public.delete_daily_report_upload_attachment(uuid)'),
    ('public.abandon_daily_report_upload_session(uuid)'),
    ('public.soft_delete_attachment(uuid)'),
    ('public.authorize_attachment_revision_removal(uuid)')
)
select signature,
       to_regprocedure(signature) is not null as function_exists,
       coalesce(
         has_function_privilege(
           'authenticated',
           to_regprocedure(signature),
           'EXECUTE'
         ),
         false
       ) as authenticated_execute
from expected
order by signature;

-- 202608240003/004：授权 RPC 仅 authenticated 可调用；物理 OSS
-- 确认 RPC 仅 service_role 可调用，authenticated/anon/public 均不得有 EXECUTE。
-- function_exists 必须均为 true；授权行应为 authenticated=true、其余=false；
-- 确认行应为 service_role=true、其余=false。
with authenticated_expected(signature) as (
  values
    ('public.authorize_attachment_object_upload(uuid)'),
    ('public.authorize_attachment_object_download(uuid)'),
    ('public.request_attachment_object_deletion(uuid)'),
    ('public.authorize_resource_attachment_object_upload(uuid)'),
    ('public.authorize_resource_attachment_object_download(uuid)'),
    ('public.request_resource_attachment_object_deletion(uuid)')
), service_role_expected(signature) as (
  values
    ('public.confirm_attachment_object_upload(uuid,text,text,bigint)'),
    ('public.confirm_attachment_object_deletion(uuid)'),
    ('public.confirm_resource_attachment_object_upload(uuid,text,text,bigint)'),
    ('public.confirm_resource_attachment_object_deletion(uuid)')
)
select signature,
       to_regprocedure(signature) is not null as function_exists,
       coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false) as authenticated_execute,
       coalesce(has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'), false) as service_role_execute,
       coalesce(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false) as anon_execute,
       coalesce(has_function_privilege('public', to_regprocedure(signature), 'EXECUTE'), false) as public_execute,
       false as confirmation_rpc
from authenticated_expected
union all
select signature,
       to_regprocedure(signature) is not null as function_exists,
       coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false) as authenticated_execute,
       coalesce(has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'), false) as service_role_execute,
       coalesce(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false) as anon_execute,
       coalesce(has_function_privilege('public', to_regprocedure(signature), 'EXECUTE'), false) as public_execute,
       true as confirmation_rpc
from service_role_expected
order by confirmation_rpc, signature;

-- 202608240005：日报 Storage 不能再直接传输业务附件；旧 client
-- finalizer 与 Storage helpers 必须对 authenticated/anon/public 均不可执行。
select
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('attachment_object_insert', 'attachment_object_read', 'attachment_object_delete')
  ) as daily_storage_policies_absent,
  coalesce(not has_function_privilege('authenticated', 'public.finalize_attachment_upload(uuid,text)', 'EXECUTE'), false) as finalizer_authenticated_denied,
  coalesce(not has_function_privilege('anon', 'public.finalize_attachment_upload(uuid,text)', 'EXECUTE'), false) as finalizer_anon_denied,
  coalesce(not has_function_privilege('public', 'public.finalize_attachment_upload(uuid,text)', 'EXECUTE'), false) as finalizer_public_denied,
  coalesce(not has_function_privilege('authenticated', 'private.can_insert_attachment_object(text,jsonb)', 'EXECUTE'), false) as insert_helper_authenticated_denied,
  coalesce(not has_function_privilege('anon', 'private.can_insert_attachment_object(text,jsonb)', 'EXECUTE'), false) as insert_helper_anon_denied,
  coalesce(not has_function_privilege('public', 'private.can_insert_attachment_object(text,jsonb)', 'EXECUTE'), false) as insert_helper_public_denied,
  coalesce(not has_function_privilege('authenticated', 'private.can_read_attachment_object(text)', 'EXECUTE'), false) as read_helper_authenticated_denied,
  coalesce(not has_function_privilege('anon', 'private.can_read_attachment_object(text)', 'EXECUTE'), false) as read_helper_anon_denied,
  coalesce(not has_function_privilege('public', 'private.can_read_attachment_object(text)', 'EXECUTE'), false) as read_helper_public_denied;

-- 202608240001/002：每行必须是 function_exists=true 且
-- authenticated_execute=true；anon/public 不得有 EXECUTE。
with expected(signature) as (
  values
    ('public.list_resources(boolean)'),
    ('public.list_eligible_resource_owners()'),
    ('public.create_resource(text,public.resource_category,public.resource_kind,text,text,date,text,text,text,text,numeric,text,uuid)'),
    ('public.archive_resource(uuid)'),
    ('public.restore_resource(uuid)'),
    ('public.get_daily_report_detail(uuid)'),
    ('public.comment_daily_report(uuid,text)'),
    ('public.confirm_daily_report(uuid,integer)'),
    ('public.list_my_notifications(integer,timestamp with time zone,uuid)'),
    ('public.mark_notification_read(uuid)'),
    ('public.mark_all_notifications_read()')
)
select signature,
       to_regprocedure(signature) is not null as function_exists,
       coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false) as authenticated_execute,
       coalesce(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), false) as anon_execute,
       coalesce(has_function_privilege('public', to_regprocedure(signature), 'EXECUTE'), false) as public_execute
from expected
order by signature;

-- 旧的无 session 写入口可能仍保留在迁移历史中，但每行
-- authenticated_execute 必须为 false；不得为了前端回滚重新授权。
with legacy(signature) as (
  values
    ('public.begin_attachment_upload(uuid,text,text,integer,public.classification)'),
    ('public.begin_entry_attachment_upload(uuid,integer,text,text,integer,public.classification)'),
    ('public.begin_entry_attachment_upload(uuid,integer,text,text,integer,public.classification,text)'),
    ('public.begin_daily_report_with_attachments(date,public.report_status,public.classification)'),
    ('public.create_daily_report(date,public.report_status,public.classification,jsonb,jsonb)'),
    ('public.update_daily_report(uuid,integer,public.report_status,public.classification,jsonb,jsonb)'),
    ('public.update_daily_report_with_attachments(uuid,integer,public.report_status,public.classification,jsonb,jsonb)'),
    ('public.save_daily_report(date,public.report_status,public.classification,jsonb,jsonb)'),
    ('public.replace_attachment(uuid,text,text,integer,public.classification)'),
    ('public.create_daily_report(uuid,uuid,date,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)'),
    ('public.update_daily_report(uuid,integer,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)'),
    ('public.begin_daily_report_with_attachments(uuid,uuid,date,public.report_status,public.classification,numeric)'),
    ('public.update_daily_report_with_attachments(uuid,integer,public.report_status,public.classification,numeric,text,numeric,jsonb,jsonb)')
)
select signature,
       to_regprocedure(signature) is not null as function_exists,
       coalesce(
         has_function_privilege(
           'authenticated',
           to_regprocedure(signature),
           'EXECUTE'
         ),
         false
       ) as authenticated_execute
from legacy
order by signature;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.daily_report_upload_sessions'::regclass,
              'public.report_attachments'::regclass);

select pg_notify('pgrst', 'reload schema');
SQL
```

再次确认 `migration list` 的本地/远端版本完全对齐。`pg_notify` 成功只说明通知已发送；还必须从 PostgREST 公网 API 用受控的、已批准 active QA 账号调用新 RPC，确认 schema cache 已更新。例如（变量只在受控 shell 中注入，命令及输出不得记录 JWT）：

```bash
curl --fail-with-body --silent --show-error \
  "$VITE_SUPABASE_URL/rest/v1/rpc/list_resources" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $QA_USER_JWT" \
  -H 'Content-Type: application/json' \
  --data '{"p_include_archived":false}'
```

返回 HTTP 200 与 JSON 数组，且同一账号可通过通知中心 RPC 读取自己的通知，才算 PostgREST 已取得 `202608240001` 至 `202608240005` 的 schema。若自托管 PostgREST 未监听 `pgrst` 通知，按 ECS 编排流程滚动重启 **PostgREST 服务**；不要重启数据库。全新实例也走同一 `db push` 历史流程，随后运行本地/隔离环境 pgTAP；**不导入任何旧业务数据或旧 OSS/Storage 测试对象**。

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

## 5. 业务附件 OSS 兼容性

- 本发布支持的日报和资源附件流程均由浏览器经同源 Node API 获取 OSS 短时签名后，直接上传到同一个私有 `timetech-okr-files` bucket；日报路径为 `organization/{organizationId}/reports/...`，资源路径为 `organization/{organizationId}/resources/...`。ECS 不代理文件字节。
- 仅 Node 附件服务在 ECS 运行时环境读取 OSS 和 `SUPABASE_SERVICE_ROLE_KEY`；前端只绑定 `api.okr.trspectra.com`。生产 bundle、Git、Nginx、日志、浏览器变量和文档示例均不得包含 OSS AccessKey、service-role、数据库密码、JWT secret 或内部 RDS 主机名。
- 不需要或不允许绑定自定义 OSS 域名。对象下载通过约 60 秒的精确 OSS GET 签名完成，bucket 一直为 private。
- 旧 Supabase Storage object 不迁移、不复制、也不用于生产兼容；不要为了旧测试对象恢复 Storage RLS/RPC 或新建第二个附件服务。`202608240005` 让日报遗留的 Storage object policy/helper 失效；完整代码、Node 重启、Nginx、CORS 和 QA 顺序见 `docs/alibaba-oss-daily-attachments.md`。

### 5.1 历史 Storage 残留（不属于本次业务文件发布）

旧 Storage 对象不属于此部署顺序，且当前发布不迁移、复制、删除或调用它们。任何历史对象的保留或删除都需要独立变更单、独立审计和专门 runbook；不得使用本发布的 OSS 操作、生产浏览器账号或附件 API 来处理它们。

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
- 构建后用 `rg -a 'https://api\.okr\.trspectra\.com' dist` 确认公开 API 域名已入包，并用 `rg -a -i '\.rds\.apsaradb\.com|rds\.aliyuncs\.com|rm-[a-z0-9-]+\..*aliyuncs\.com' dist` 确认内部 RDS 主机名为零匹配。任何命中都停止发布。

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

本发布所含 migration（`202608240001` 至 `202608240005`）都是 additive/forward-only。资源 Storage 入口、日报 Storage object policy/helper 和旧的无 session 写入口均已撤销 `authenticated` 权限。**不要** drop 新表/列、删除 migration history，也不要为了回滚前端重新开放旧 RPC；那会恢复残留 pending、绕过锁定、重新暴露 Storage 传输或破坏通知审计路径。

- 前端回滚只能回到与 session-aware RPC 签名兼容的已审核构建。
- 若需要立即止血，先撤销新日报写 RPC 的 `authenticated` 执行权限，使日报暂时只读，再 reload PostgREST。该操作必须有变更审批：

```sql
begin;
revoke execute on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) from authenticated;
revoke execute on function public.begin_entry_attachment_upload(uuid, uuid, integer, text, text, integer, public.classification, text) from authenticated;
revoke execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) from authenticated;
revoke execute on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) from authenticated;
revoke execute on function public.delete_daily_report_upload_attachment(uuid) from authenticated;
revoke execute on function public.abandon_daily_report_upload_session(uuid) from authenticated;
revoke execute on function public.soft_delete_attachment(uuid) from authenticated;
revoke execute on function public.authorize_attachment_revision_removal(uuid) from authenticated;
revoke execute on function public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, uuid) from authenticated;
revoke execute on function public.archive_resource(uuid) from authenticated;
revoke execute on function public.restore_resource(uuid) from authenticated;
revoke execute on function public.comment_daily_report(uuid, text) from authenticated;
revoke execute on function public.confirm_daily_report(uuid, integer) from authenticated;
select pg_notify('pgrst', 'reload schema');
commit;
```

上述集合覆盖了当前 session/report/attachment 写工作流；`list_daily_report_upload_session_cleanup`、`create_attachment_download` 等只读入口保持可用。`authorize_attachment_revision_removal` 本身只校验、不写数据，但为了停止完整的附件修订工作流也在止血集合中。

修复并重新验证后，仅用以下对称授权恢复同一集合，然后 reload PostgREST：

```sql
begin;
grant execute on function public.begin_daily_report_upload_session(date, public.report_status, public.classification) to authenticated;
grant execute on function public.begin_entry_attachment_upload(uuid, uuid, integer, text, text, integer, public.classification, text) to authenticated;
grant execute on function public.save_daily_report(date, public.report_status, public.classification, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.adopt_daily_report_revision_attachments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.delete_daily_report_upload_attachment(uuid) to authenticated;
grant execute on function public.abandon_daily_report_upload_session(uuid) to authenticated;
grant execute on function public.soft_delete_attachment(uuid) to authenticated;
grant execute on function public.authorize_attachment_revision_removal(uuid) to authenticated;
grant execute on function public.create_resource(text, public.resource_category, public.resource_kind, text, text, date, text, text, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.archive_resource(uuid) to authenticated;
grant execute on function public.restore_resource(uuid) to authenticated;
grant execute on function public.comment_daily_report(uuid, text) to authenticated;
grant execute on function public.confirm_daily_report(uuid, integer) to authenticated;
select pg_notify('pgrst', 'reload schema');
commit;
```

如果问题需要改变数据库结构或函数实现，必须新建已审核的 forward migration，不直接改已应用文件。

---

## 9. 验收清单

- `npm ci && npm run typecheck && npm run test:run` 全绿。
- `npm run build:production`（注入真实 URL/anon key）通过。
- 新实例：注册→登录→session→管理员审批→角色绑定端到端可用。
- 日报/资源附件上传与下载、同一私有 OSS bucket 的两个前缀、RLS 与 API 拒绝项逐项冒烟；旧 Storage 测试对象不迁移。
- 结构迁移后 `supabase db lint` 零错误。

日报附件发布的角色化手工 QA 门禁：

1. Employee 和 Project Leader 各自在当日日报选择一个无敏感小文件；确认选择后立即上传，且进度条/百分比可观测。
2. 在等待、上传中、服务器校验中、失败或删除中的任一状态，“提交日报”必须为原生 disabled；仅在所有附件服务端终态校验完成并显示 100% 后可提交。
3. 提交成功后 reload，确认内容、工时、附件及显示名均持久化；在同一上海业务日编辑，保留或删除历史附件后再次提交并 reload 核对。
4. Management 确认该报告后，Employee reload 必须同步看到已确认/已锁定，编辑入口消失；直接调用任何 save/finalize/abandon/delete RPC 也必须被数据库拒绝。
5. 使用前一上海业务日的报告重复锁定验证；无论状态是否 confirmed，都不得编辑或新建上传 session。

### 9.1 资源访问、日报审核与通知的隔离账号 QA

仓库目前**没有 Playwright 配置或浏览器 E2E 测试文件**；以下是上线前必须在本地 Supabase 或隔离测试组织使用的浏览器手工门禁，不能以 pgTAP 结果替代。现有 `supabase/tests/resources.test.sql` 与 `supabase/tests/daily_report_review_notifications.test.sql` 是服务端角色矩阵证据（所有角色/RPC/RLS 断言通过），**不是**浏览器 E2E 证据。不要以生产员工账号、真实生产资源或敏感附件执行这份清单。

1. 以 employee 创建资源：先保留自己为负责人，再指定另一位合格 employee；核对 `created_by`、`owner_id` 及负责人通知。
2. 以被指定 employee 登录，核对红点；点击负责人通知应打开资源详情。跨组织或 inactive 候选不可选；用 API/RPC 伪造参数也必须被服务端拒绝。
3. employee 提交含小型无敏感附件的日报，核对上传进度布局不会重叠。
4. 以直属 Project Leader 登录，只看到获授权 blocks，并能查看、下载和评论。
5. 以非直属 Project Leader 与仅有 administrator 角色的账号登录，均应被拒绝查看、评论和确认。
6. 回到 employee 账号，核对日报通知红点；点击通知打开详情并标记已读。
7. 以 Management 查看 Project Leader 日报并确认。
8. 确认后，核对作者不能编辑，reviewer 仍能评论。
9. 作者和 reviewer 分别导出 PDF 打印视图与 `.docx`，核对只包含各自可见内容。

记录每一项的账号角色、测试组织、时间、预期/实际结果、截图或非敏感请求 ID。完成前不得声明浏览器 QA 已通过；本仓库当前自动化边界仅为 pgTAP、Vitest、类型检查和生产构建。
