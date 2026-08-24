# 日报审核、通知、导出与资源权限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复附件上传排版，并交付所有角色资源访问、受控日报详情/评论/确认、账户通知中心及 PDF/Word 导出。

**Architecture:** 使用两个 additive PostgreSQL migration 分别收敛资源权限与日报审核/通知权限；前端通过扩展 `OkrRepository` 调用 SECURITY DEFINER RPC，不从 dashboard 大包数据推断敏感详情。日报详情、评论、确认与通知保持独立接口，附件下载继续经过现有下载授权；PDF 使用浏览器打印视图，Word 使用 `docx` 在浏览器端生成。

**Tech Stack:** React、TypeScript、Vite、Vitest、Testing Library、Supabase/PostgreSQL 17、pgTAP、RLS、`docx`。

## Global Constraints

- 不创建虚假生产员工或演示数据；自动化测试只使用事务内隔离测试数据。
- `administrator` 不自动获得业务日报查看、评论或确认权限。
- Project Leader 只访问自己负责 Objective 下 KR 所关联的日报条目；管理层按组织范围访问。
- 日报确认后正文与附件锁定，但授权审核者仍可追加评论。
- 评论和确认通知必须与业务写入处于同一数据库事务。
- 所有角色可查看、搜索、查看资源详情、报告问题和添加资源。
- 资源负责人、管理层、管理员可修改资源；只有管理层、管理员可归档资源。
- 附件下载必须继续调用短期下载授权，不返回永久公开 URL 或 OSS 凭据。
- 导出只包含已授权详情数据和附件清单，不嵌入附件原文件。
- 本轮不实现邮箱确认、忘记密码、重置密码或资源问题邮件改造。
- 所有数据库变更使用新 migration；不得修改已部署的 `20260823*` migration。
- 不在 Git、浏览器构建、日志或文档中写入 service-role key、数据库密码、JWT secret 或 OSS AccessKey。

---

### Task 1: 修复日报附件上传排版

**Files:**
- Modify: `src/pages/daily-report/AttachmentList.tsx`
- Modify: `src/pages/daily-report/AttachmentList.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `DailyEvidenceDraft` 的 `label`、`uploadState`、`progress`、`attachmentId`。
- Produces: `.daily-attachment-progress` 布局约定，后续详情弹窗复用相同附件状态文案。

- [ ] **Step 1: 写长文件名与进度区互不覆盖的失败测试**

```tsx
render(<AttachmentList items={[uploadedFile({
  label: 'Q4_AI_Market_Review_Report_Answer_CN_with_a_very_long_name.docx',
  progress: 100,
})]} />);
expect(screen.getByText(/Q4_AI_Market/)).toHaveAttribute('title', expect.stringContaining('.docx'));
expect(screen.getByRole('progressbar')).toHaveAccessibleName(/Q4_AI_Market/);
expect(screen.getByText('100%')).toBeVisible();
```

- [ ] **Step 2: 验证测试先失败**

Run: `npm test -- --run src/pages/daily-report/AttachmentList.test.tsx`  
Expected: FAIL，因为当前文件名、bar 和状态共用行内布局且文件名没有截断容器。

- [ ] **Step 3: 拆分语义与布局区域**

```tsx
<div className="daily-attachment-progress">
  <span className="daily-attachment-progress__name" title={item.label}>{item.label}</span>
  <progress aria-label={t('daily.uploadProgressFor', { name: item.label })} value={visibleProgress} max={100} />
  <span className="daily-attachment-progress__percent">{visibleProgress}%</span>
  <span className="daily-attachment-progress__state">{stateLabel}</span>
</div>
```

CSS 使用 `grid-template-columns: minmax(0, 1fr) minmax(8rem, 16rem) auto auto`；文件名使用 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`；在 `max-width: 720px` 下切换为单列/两列换行。不得把 `uploading 100%` 显示为“上传完成”，只有 `uploaded && attachmentId` 才完成。

- [ ] **Step 4: 运行测试与类型检查**

Run: `npm test -- --run src/pages/daily-report/AttachmentList.test.tsx src/pages/daily-report/DailyReportForm.test.tsx && npm run typecheck`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/pages/daily-report/AttachmentList.tsx src/pages/daily-report/AttachmentList.test.tsx src/styles/global.css
git commit -m "fix: separate daily attachment progress layout"
```

---

### Task 2: 开放资源查看与新增，同时保留修改/归档边界

**Files:**
- Create: `supabase/migrations/202608240001_resource_access.sql`
- Modify: `supabase/tests/resources.test.sql`
- Modify: `src/navigation/navigation.ts`
- Modify: `src/layout/AppShell.test.tsx`
- Modify: `src/auth/permissionService.ts`
- Modify: `src/auth/permissionService.test.ts`
- Modify: `src/pages/ResourcesPage.tsx`
- Modify: `src/pages/ResourcesPage.test.tsx`
- Modify: `src/pages/ResourceDetailPage.tsx`
- Modify: `src/pages/ResourceDetailPage.test.tsx`

**Interfaces:**
- Produces: 所有 active role 可执行 `list_resources`、`get_resource_detail`、`create_resource`、`report_resource_problem`。
- Produces: `resource.update` 仅 owner/management/administrator；`resource.archive` 仅 management/administrator。

- [ ] **Step 1: 写角色矩阵失败测试**

pgTAP 增加 employee、HR、Project Leader、management、administrator 五种 active role，并断言：

```sql
select lives_ok($$select public.list_resources(false)$$, 'employee can list resources');
select lives_ok(
  $$select public.create_resource('Employee Tool', 'tools', 'durable', '', 'Workshop', null, null, null, '', null, 1, 'set')$$,
  'employee can add a resource'
);
select throws_ok(
  $$select public.update_resource('24000000-0000-0000-0000-000000000001', 'Fixture Lens', 'optics', 'durable', '', 'Optics Lab / Cabinet A', null, null, null, '', null, 1, 'set', 'available')$$,
  '42501', 'Resource is not editable by the current user', 'non-owner employee cannot edit'
);
select throws_ok(
  $$select public.archive_resource('24000000-0000-0000-0000-000000000001')$$,
  '42501', 'Resource is not archivable by the current user', 'employee cannot archive'
);
```

前端断言 `resourceRoles` 不再过滤 employee/HR，且所有角色都看到“添加资源”；非 owner employee 不看到修改/归档。

- [ ] **Step 2: 运行 RED**

Run: `npx supabase test db supabase/tests/resources.test.sql && npm test -- --run src/layout/AppShell.test.tsx src/auth/permissionService.test.ts src/pages/ResourcesPage.test.tsx src/pages/ResourceDetailPage.test.tsx`  
Expected: FAIL，当前导航过滤 employee/HR，且归档 RPC 仍允许资源 owner。

- [ ] **Step 3: 新增 additive migration**

先以现有 `private.is_operational()` 为统一的“approved active profile + active role”边界；保留已满足要求的读取、详情、新增和问题报告函数，只在 `202608240001_resource_access.sql` 中 `create or replace` 当前不符合规格的 `archive_resource` 与 `restore_resource`，同时保持：

```sql
-- update
if target.owner_id <> auth.uid()
   and not private.has_role('management')
   and not private.has_role('administrator') then
  raise exception 'Resource is not editable by the current user' using errcode = '42501';
end if;

-- archive
if not (private.has_role('management') or private.has_role('administrator')) then
  raise exception 'Resource is not archivable by the current user' using errcode = '42501';
end if;
```

替换的两个函数使用 `security definer`、`set search_path = ''`、精确 schema 引用，并分别执行 `revoke all on function public.archive_resource(uuid) from public, anon`、`revoke all on function public.restore_resource(uuid) from public, anon`，再仅向 `authenticated` grant execute。不得授予浏览器直接 INSERT/UPDATE/DELETE 表权限。

- [ ] **Step 4: 更新前端权限与导航**

移除 `/resources` 的 `roles` 过滤；为 Resource permission scope 明确定义：create 对 active role 开放，update 检查 owner/management/administrator，archive 检查 management/administrator。按钮必须调用 `can(...)`，不能仅比较 role 字符串。

- [ ] **Step 5: 运行 focused tests**

Run: `npx supabase test db supabase/tests/resources.test.sql && npm test -- --run src/layout/AppShell.test.tsx src/auth/permissionService.test.ts src/pages/ResourcesPage.test.tsx src/pages/ResourceDetailPage.test.tsx && npm run typecheck`  
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations/202608240001_resource_access.sql supabase/tests/resources.test.sql src/navigation/navigation.ts src/layout/AppShell.test.tsx src/auth/permissionService.ts src/auth/permissionService.test.ts src/pages/ResourcesPage.tsx src/pages/ResourcesPage.test.tsx src/pages/ResourceDetailPage.tsx src/pages/ResourceDetailPage.test.tsx
git commit -m "feat: open resource access to active employees"
```

---

### Task 3: 建立日报详情、评论和通知数据库边界

**Files:**
- Create: `supabase/migrations/202608240002_report_review_notifications.sql`
- Create: `supabase/tests/daily_report_review_notifications.test.sql`
- Modify: `supabase/tests/daily_upload_lifecycle.test.sql`

**Interfaces:**
- Produces RPCs:
  - `public.get_daily_report_detail(uuid) returns jsonb`
  - `public.comment_daily_report(uuid,text) returns jsonb`
  - `public.confirm_daily_report(uuid,integer) returns void`（增强现有签名）
  - `public.list_my_notifications(integer,timestamptz,uuid) returns jsonb`
  - `public.mark_notification_read(uuid) returns void`
  - `public.mark_all_notifications_read() returns integer`
- Produces tables: `daily_report_comments`, `user_notifications`。

- [ ] **Step 1: 写 35+ 项 pgTAP 权限与事务测试**

测试夹具包含：作者 employee、直属 leader、非直属 leader、management、administrator，以及含两个不同 leader Objective 的日报。必须覆盖：

```sql
select lives_ok($$select public.get_daily_report_detail(report_id)$$, 'author reads full own detail');
select lives_ok($$select public.comment_daily_report(report_id, '请补充测量数据')$$, 'direct leader comments');
select throws_ok($$select public.comment_daily_report(report_id, 'no')$$, '42501', 'Daily report is not available', 'unrelated leader rejected');
select throws_ok($$select public.get_daily_report_detail(report_id)$$, '42501', 'Daily report is not available', 'administrator alone rejected');
select is((select count(*) from public.user_notifications where notification_type = 'daily_report_comment'), 1::bigint, 'comment creates one notification');
select is((select count(*) from public.user_notifications where recipient_id <> author_id), 0::bigint, 'notifications target only report author');
```

直属 Project Leader 的详情只返回其负责 Objective/KR 对应 blocks；management 与作者返回全部获密级授权 blocks。确认仍用 `expected_revision`；重复确认不重复插入 `daily_report_confirmed` 通知。评论在 confirmed 后仍成功。

- [ ] **Step 2: 运行 RED**

Run: `npx supabase test db supabase/tests/daily_report_review_notifications.test.sql`  
Expected: FAIL，因为表和 RPC 尚不存在。

- [ ] **Step 3: 创建不可变评论与私有通知表**

```sql
create table public.daily_report_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (organization_id, report_id) references public.daily_reports(organization_id, id) on delete cascade
);

create type public.user_notification_type as enum ('daily_report_comment', 'daily_report_confirmed');
create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type public.user_notification_type not null,
  report_id uuid,
  comment_id uuid references public.daily_report_comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
```

启用并 FORCE RLS；撤销浏览器直接写。添加确认通知 partial unique index：`(recipient_id, report_id, notification_type) where notification_type='daily_report_confirmed'`。

- [ ] **Step 4: 实现统一服务端授权 helper**

创建 `private.can_review_daily_report_block(report_id, block_id, reviewer_id)` 和 `private.can_review_daily_report(report_id, reviewer_id)`。management 通过组织+密级；Project Leader 必须通过 block → KR → Objective.owner_id。作者仅通过详情读取，不通过评论/确认。管理员无特殊放行。

`get_daily_report_detail` 返回固定 JSON shape：

```json
{
  "id": "uuid",
  "authorId": "uuid",
  "authorName": "姓名",
  "date": "YYYY-MM-DD",
  "status": "submitted",
  "hours": 8,
  "currentRevision": 2,
  "blocks": [],
  "comments": [],
  "canComment": true,
  "canConfirm": true
}
```

每个 attachment 只返回 `attachmentId`、`displayName`、`classification`；不返回 Storage path 或永久 URL。

- [ ] **Step 5: 实现评论、确认和通知事务**

`comment_daily_report` 锁定 report 当前 revision，校验 reviewer，插入 comment，再插入作者通知，返回 comment JSON。增强 `confirm_daily_report`：仅 management 或具有 block review scope 的直属 leader；状态首次从 submitted→confirmed 时插入一条确认通知，confirmed 时幂等返回，revision 冲突仍报 `40001`。

通知 RPC 使用 `(created_at,id)` 游标，最大 `p_limit=50`；mark RPC 的 WHERE 必须包含 `recipient_id=auth.uid()` 和当前 organization。

- [ ] **Step 6: 运行 pgTAP 与 lint**

Run: `npx supabase db reset && npx supabase test db supabase/tests/daily_report_review_notifications.test.sql && npx supabase test db && npx supabase db lint --local --schema public --level warning`  
Expected: 新测试和全量测试 PASS；无新增 public error/warning。

- [ ] **Step 7: 提交**

```bash
git add supabase/migrations/202608240002_report_review_notifications.sql supabase/tests/daily_report_review_notifications.test.sql supabase/tests/daily_upload_lifecycle.test.sql
git commit -m "feat: secure daily report reviews and notifications"
```

---

### Task 4: 扩展领域类型与 Supabase Repository

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/data/types.ts`
- Modify: `src/data/supabaseRepository.ts`
- Modify: `src/data/supabaseRepository.test.ts`
- Modify: `src/data/demoRepository.ts`

**Interfaces:**
- Produces types: `DailyReportDetail`, `DailyReportComment`, `UserNotification`, `NotificationPage`。
- Produces repository methods: `getDailyReportDetail`、`commentDailyReport`、`listMyNotifications`、`markNotificationRead`、`markAllNotificationsRead`。

- [ ] **Step 1: 写 repository RPC mapping 的失败测试**

```ts
await expect(repository.getDailyReportDetail('report-1')).resolves.toEqual({ ok: true, data: detail });
expect(client.rpc).toHaveBeenCalledWith('get_daily_report_detail', { p_report_id: 'report-1' });
await repository.commentDailyReport('report-1', '请补充数据');
expect(client.rpc).toHaveBeenCalledWith('comment_daily_report', { p_report_id: 'report-1', p_body: '请补充数据' });
```

覆盖 locked、clearance、forbidden、conflict、network 错误映射；notification JSON 的日期、readAt nullable 和 cursor mapping。

- [ ] **Step 2: 定义精确 TypeScript 接口**

```ts
export interface DailyReportComment { id: string; reportId: string; authorId: string; authorName: string; body: string; createdAt: string }
export interface DailyReportDetail { id: string; authorId: string; authorName: string; date: string; status: ReportStatus; hours: number; currentRevision: number; blocks: DailyOkrBlock[]; comments: DailyReportComment[]; canComment: boolean; canConfirm: boolean }
export type UserNotificationType = 'daily_report_comment' | 'daily_report_confirmed';
export interface UserNotification { id: string; type: UserNotificationType; reportId: string; actorName: string; readAt: string | null; createdAt: string }
export interface NotificationPage { items: UserNotification[]; nextCursor: { createdAt: string; id: string } | null; unreadCount: number }
```

- [ ] **Step 3: 实现 repository methods**

所有方法只通过 `callRpc`；不得直接 select/insert 评论或通知表。Demo repository 返回确定性 mock notification/detail，不能写入生产 demo 数据。

- [ ] **Step 4: 运行测试**

Run: `npm test -- --run src/data/supabaseRepository.test.ts src/data/repositoryFactory.test.ts && npm run typecheck`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/types.ts src/data/types.ts src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts src/data/demoRepository.ts
git commit -m "feat: add report review repository contracts"
```

---

### Task 5: 日报详情弹窗、评论、确认与附件下载

**Files:**
- Create: `src/pages/daily-report/DailyReportDetailDialog.tsx`
- Create: `src/pages/daily-report/DailyReportDetailDialog.test.tsx`
- Modify: `src/pages/DailyReportsPage.tsx`
- Modify: `src/pages/DailyReportsPage.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 4 repository methods and `DailyReportDetail`。
- Produces: `DailyReportDetailDialog`，Task 6 通知点击复用 `openReportDetail(reportId)`。

- [ ] **Step 1: 写详情交互 RED tests**

覆盖：列表不再内嵌整篇 blocks；“查看详情”按需加载；作者只读评论；直属 leader/management 可评论和确认；confirmed 后隐藏确认但保留评论；附件下载调用现有 `createAttachmentDownload`；无权限错误不展示残留详情。

```tsx
await user.click(screen.getByRole('button', { name: '查看详情' }));
expect(repository.getDailyReportDetail).toHaveBeenCalledWith('report-member');
expect(await screen.findByRole('dialog', { name: /日报详情/ })).toBeVisible();
```

- [ ] **Step 2: 运行 RED**

Run: `npm test -- --run src/pages/DailyReportsPage.test.tsx src/pages/daily-report/DailyReportDetailDialog.test.tsx`  
Expected: FAIL，dialog 尚不存在。

- [ ] **Step 3: 实现可访问 dialog**

使用原生 `<dialog>` 或仓库现有 modal pattern；需要 focus trap/初始 focus、Escape 关闭、关闭后焦点返回触发按钮、`aria-labelledby`。评论 textarea 失败时保留内容；提交成功追加服务端返回 comment 并清空。确认成功后本地 detail/list 状态同步为 confirmed。

- [ ] **Step 4: 简化列表摘要与动作**

表格内容列只显示日报条目数量/摘要；所有 own/member row 提供“查看详情”。编辑、锁定和查看详情为独立动作。Project Leader 的 member list 仍由服务端/dashboard 摘要权限过滤，详情是最终授权边界。

- [ ] **Step 5: 运行测试与 a11y**

Run: `npm test -- --run src/pages/DailyReportsPage.test.tsx src/pages/daily-report/DailyReportDetailDialog.test.tsx src/app/accessibility.test.tsx && npm run typecheck`  
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/pages/DailyReportsPage.tsx src/pages/DailyReportsPage.test.tsx src/pages/daily-report/DailyReportDetailDialog.tsx src/pages/daily-report/DailyReportDetailDialog.test.tsx src/i18n/messages.ts src/styles/global.css
git commit -m "feat: review daily reports in a detail dialog"
```

---

### Task 6: 在账户菜单中新增通知中心和红点

**Files:**
- Create: `src/layout/NotificationCenter.tsx`
- Create: `src/layout/NotificationCenter.test.tsx`
- Create: `src/hooks/useNotifications.ts`
- Create: `src/hooks/useNotifications.test.tsx`
- Modify: `src/layout/AccountMenu.tsx`
- Modify: `src/layout/AccountMenu.test.tsx`
- Modify: `src/layout/AppShell.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 4 notification repository methods。
- Produces: `useNotifications()` 与 `openReportFromNotification(reportId)` callback。

- [ ] **Step 1: 写通知红点与已读状态 RED tests**

覆盖无未读无红点、有未读显示 red dot 和可访问数量、菜单显示“消息通知 2”、单条已读、全部已读、点击通知先 mark 再请求详情、不可访问时仍已读并显示错误。

- [ ] **Step 2: 实现 hook**

```ts
export interface NotificationState {
  items: UserNotification[];
  unreadCount: number;
  loading: boolean;
  error?: RepositoryErrorCode;
  refresh(): Promise<void>;
  markRead(id: string): Promise<boolean>;
  markAllRead(): Promise<boolean>;
}
```

账户切换时清空旧用户数据；打开菜单或 panel 时 refresh；不得用无限 polling。首版只在登录/打开 panel/评论确认成功后刷新。

- [ ] **Step 3: 实现账户菜单入口与 panel**

红点放在账户圆框右侧，compact sidebar 仍可见；`aria-label` 包含未读数。NotificationCenter 使用 dialog/panel，按创建时间倒序，提供逐条和全部已读。通过 AppShell/DailyReportsPage 的轻量 context 或 event callback 打开详情，不新增侧边栏 route。

- [ ] **Step 4: 运行测试**

Run: `npm test -- --run src/layout/AccountMenu.test.tsx src/layout/NotificationCenter.test.tsx src/hooks/useNotifications.test.tsx src/app/accessibility.test.tsx && npm run typecheck`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/layout/NotificationCenter.tsx src/layout/NotificationCenter.test.tsx src/hooks/useNotifications.ts src/hooks/useNotifications.test.tsx src/layout/AccountMenu.tsx src/layout/AccountMenu.test.tsx src/layout/AppShell.tsx src/i18n/messages.ts src/styles/global.css
git commit -m "feat: add account notification center"
```

---

### Task 7: 导出 PDF 打印视图与 Word 文件

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/services/dailyReportExport.ts`
- Create: `src/services/dailyReportExport.test.ts`
- Create: `src/pages/daily-report/DailyReportPrintView.tsx`
- Modify: `src/pages/daily-report/DailyReportDetailDialog.tsx`
- Modify: `src/pages/daily-report/DailyReportDetailDialog.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `DailyReportDetail`，不得额外绕过权限加载数据。
- Produces: `exportDailyReportWord(detail): Promise<void>` 和 `printDailyReportPdf(detail): void`。

- [ ] **Step 1: 添加 Word dependency**

Run: `npm install docx`  
Expected: `package.json`/lockfile 记录固定兼容版本。

- [ ] **Step 2: 写导出 RED tests**

Word 测试 mock `Packer.toBlob` 和 anchor click，断言文件名 `日报-王芳-2026-08-24.docx`，正文包含 Objective、KR、工作描述、结果、工时、评论、附件显示名，不包含 storage path/download token。PDF 测试 mock `window.open`/`print`，断言打印视图 HTML 做转义且标题正确。

- [ ] **Step 3: 实现 Word export**

使用 `docx` 的 `Document`、`Paragraph`、`HeadingLevel`、`Table`、`Packer.toBlob`；中文文字来自 Unicode 字符串。通过 `URL.createObjectURL` 下载，并在 click 后 `URL.revokeObjectURL`。

- [ ] **Step 4: 实现 PDF 打印视图**

`导出 PDF` 打开只包含授权详情的打印窗口，加载完成后调用 `print()`；CSS `@media print` 隐藏 controls，并提示用户在系统打印框选择“另存为 PDF”。不得把数据库或附件 URL写入页面。若 popup 被阻止，返回 typed UI error。

- [ ] **Step 5: 接入详情弹窗与权限**

作者和 detail-authorized reviewer 显示两个导出按钮；按钮只使用已加载 detail。导出中的按钮 disabled 防重复。错误显示在 dialog 内且不关闭 dialog。

- [ ] **Step 6: 运行测试与构建**

Run: `npm test -- --run src/services/dailyReportExport.test.ts src/pages/daily-report/DailyReportDetailDialog.test.tsx && npm run typecheck && npm run build`  
Expected: PASS；Vite 只允许既有 chunk advisory，不允许构建错误。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json src/services/dailyReportExport.ts src/services/dailyReportExport.test.ts src/pages/daily-report/DailyReportPrintView.tsx src/pages/daily-report/DailyReportDetailDialog.tsx src/pages/daily-report/DailyReportDetailDialog.test.tsx src/i18n/messages.ts src/styles/global.css
git commit -m "feat: export authorized daily reports"
```

---

### Task 8: 全量验证、角色 QA 与部署交接

**Files:**
- Modify: `docs/alibaba-rds-supabase-init.md`
- Modify: `docs/user-guide.zh-CN.md`
- Modify: `docs/user-guide.en.md`

**Interfaces:**
- Validates: Tasks 1–7 的全部数据库和前端接口。

- [ ] **Step 1: 运行完整数据库验证**

```bash
npx supabase db reset
npx supabase test db
npx supabase db lint --local --schema public --level warning
```

Expected: 全部 pgTAP PASS；无新增 public lint error/warning。仅允许记录已确认、无法在本轮安全消除的兼容签名 warning。

- [ ] **Step 2: 运行完整前端验证**

```bash
npm test -- --run
npm run typecheck
VITE_APP_MODE=supabase VITE_SUPABASE_URL=https://api.okr.trspectra.com VITE_SUPABASE_ANON_KEY=sb_publishable_localverification123 npm run build:production
```

Expected: Vitest 全绿、typecheck/build 退出 0；bundle 包含 `https://api.okr.trspectra.com`，不包含内部 `*.rds.apsaradb.com`。

- [ ] **Step 3: 执行角色 E2E/浏览器 QA**

如仓库已有 Playwright 则自动执行；否则使用本地 Supabase 的隔离账号执行并记录：

1. employee 添加资源并提交带附件日报，进度布局不重叠；
2. 直属 leader 只看到授权 blocks，查看、下载、评论；
3. 非直属 leader 和 administrator 被拒绝；
4. employee 账户出现红点，点击通知打开详情并标记已读；
5. management 查看 Project Leader 日报并确认；
6. confirmed 后作者不可编辑，reviewer 仍能评论；
7. 作者和 reviewer 导出 PDF print view 与 `.docx`。

- [ ] **Step 4: 更新部署与用户指南**

部署文档列出 `202608240001`、`202608240002` 顺序、`db push --dry-run`、PostgREST reload、RPC/grant 验证和 rollback-first 止血。用户指南说明资源权限、审核范围、评论、确认锁定、通知中心和导出；明确 administrator 不等于 management。

- [ ] **Step 5: 提交文档**

```bash
git add docs/alibaba-rds-supabase-init.md docs/user-guide.zh-CN.md docs/user-guide.en.md
git commit -m "docs: deploy report review notifications"
```

- [ ] **Step 6: 最终检查**

Run: `git status --short && git log --oneline -10 && git diff --check`  
Expected: 工作树干净，所有 task commit 可见，无 whitespace error。未经用户明确授权不得 push、merge 或部署生产服务器。
