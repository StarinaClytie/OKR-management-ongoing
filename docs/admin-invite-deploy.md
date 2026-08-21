# Phase 1.5 · 管理员邀请用户 — 部署说明

本阶段把新员工 onboarding 从「注册 → 待分配 → 管理员批准」改为「管理员邀请 → 员工点邮件 → 设置密码 → 直接可用」。
`invite = provision + invitation`，不再需要第二次「批准」。

## 1. 变更内容

| 层 | 内容 |
|---|---|
| Edge Function | 新增 `admin-invite-user`：验证调用方 JWT → 确认 active administrator → 用 service role 调 `auth.admin.inviteUserByEmail` → 复用现有 RPC `approve_pending_user` 写 `profiles` + `user_roles`。 |
| 前端 | `/users` 页新增「邀请用户」主操作 + 邀请弹窗；`AdminUserService.inviteUser`；`/auth/invite` 邀请接受页（`InviteAccept`）设置密码；新增 `invite_pending` 认证状态。 |
| 数据库 | **无新增迁移**。复用 `profiles.email` 与 `approve_pending_user`（Phase 1 已存在）。 |

## 2. 迁移

无需新增 SQL。现有迁移保持原顺序即可（`202608170001_admin_users.sql` 已含所需 RPC 与字段）。

```bash
npx supabase db reset --yes
npx supabase test db
npx supabase db lint
```

## 3. 部署 Edge Function

```bash
npx supabase functions deploy admin-invite-user --project-ref eomesxviqudmowgwftnn
```

`admin-invite-user` 使用 Edge Runtime 自动注入的 `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`，
**无需手工配置 secret**。service-role key 只存在于 function 服务端，绝不出现在前端 bundle、Vite env 或浏览器请求中。

## 4. Supabase Dashboard 手工配置（生产）

### 4.1 Authentication → URL Configuration

| 项 | 值 |
|---|---|
| Site URL | `https://okr.groupmeeting.xyz` |
| Redirect URLs | 至少包含 `https://okr.groupmeeting.xyz/auth/invite`；开发环境另加 `http://localhost:5173/auth/invite`、`http://127.0.0.1:5173/auth/invite` |

> Redirect URL 必须与 `admin-invite-user` 内的 server-side allowlist 一致；function 会拒绝任何来自前端 body 的任意 redirect，只允许上述 origin。

### 4.2 Authentication → Email Templates → Invite user

- 保留模板中的 `{{ .ConfirmationURL }}`（或 `{{ .SiteURL }}` + `{{ .TokenHash }}`）变量，不要移除或改写。
- Phase 1.5 代码只负责 `inviteUserByEmail`，不在代码里模拟或代发邮件。

### 4.3 邮件服务

第一版使用 **Supabase 默认 email provider**（开发/测试、低量场景）。**不要**在本阶段接入 Aliyun DirectMail / Resend / SendGrid / AWS SES / Postmark / Brevo 或自定义 SMTP。

> 未来生产员工大规模 rollout 时，应在 Dashboard 配置 custom SMTP 以提高送达率与品牌化。Phase 1.5 不实现 SMTP。

## 5. 邀请流程（invitation flow）

```
Administrator → 用户与权限 → [+ 邀请用户] → 填邮箱/姓名/部门/职位/Role
  → Edge Function inviteUserByEmail(email, { redirectTo, data })
  → Supabase Auth 发送 Invite User Email
  → 员工点邮件链接 → 回到 /auth/invite
  → 设置密码 (auth.updateUser({ password }))
  → 登录 → 直接具备正确 profile + role → 出现在组织用户列表
```

## 6. Provisioning 流程与失败补偿

采用方案 A：`inviteUserByEmail` 成功返回新建 `auth.users` 的 UUID 后，立即通过调用方身份调用
`approve_pending_user`（SECURITY DEFINER，组织来自 `auth.uid()`，而非 body），在同一 Postgres 事务内写入
`profiles` 与 `user_roles`。`profiles.email` 使用与 `auth.users.email` 一致（规范化为小写）的邮箱。

Auth Admin API 与 Postgres 不是同一事务，因此做了补偿与幂等：

- **invite 成功但 provision 失败** → 返回 `provisioning_failed`；该 auth 用户落在「待分配用户」列表，下次对同一邮箱邀请走「已存在 auth 用户但缺 profile」的 recovery 分支补全，不重复建号。
- **profile 已存在** → `approve_pending_user` 抛 `23505`，function 捕获并返回 `already_member`。
- **auth 用户已存在但缺 profile** → 直接补全（`recovered`），若其 `email_confirmed_at` 为空则补发邀请链接。
- **同一邮箱重复提交** → 第二次命中上述分支，不会创建重复 `profiles` / `user_roles`。

返回结果（`outcome`）三种成功态：`invited`（新建并发送邀请）、`recovered`（账号已存在，权限已补全）、`already_member`（邮箱已属于组织成员）。

## 7. 安全模型

1. Edge Function 先用 anon key + 调用方 JWT `auth.getUser()` 校验身份。
2. 通过 RLS 读取 `user_roles` 确认调用方是 active administrator（停用会翻转 `user_roles.is_active`，故 inactive 管理员被拒绝）。
3. 组织来源始终是 RPC 内的 `private.current_organization_id()`（基于 `auth.uid()`），**绝不信任 `request.body.organizationId`**。
4. service role 仅在通过前两步校验后使用，用于枚举 auth users / profiles 与发送邀请。
5. 前端 bundle 不含任何 secret；`auth.admin` 只在 Edge Function 内调用。

## 8. 验证清单

1. 管理员在「用户与权限」看到「邀请用户」按钮；员工/管理层/项目负责人/HR 看不到（页面返回「访问受限」）。
2. 邀请弹窗：邮箱、姓名、Role 必填，Role 默认 Employee；非法邮箱显示「请输入有效的邮箱地址」。
3. 成功邀请显示「邀请已发送至 {email}」，新用户直接出现在「已启用用户」列表。
4. 邀请已存在的 auth 用户（缺 profile）显示「账号已存在，组织权限已补全」。
5. 邮箱已属于组织成员时显示「该邮箱已属于组织成员」。
6. 员工点邀请邮件回到 `/auth/invite`，显示「欢迎加入瞬谱光电 OKR」，设置密码后进入 dashboard。
7. 密码不一致 / 过短有明确提示；设置成功后不再要求管理员临时密码。
8. 停用管理员调用 `admin-invite-user` 被拒绝；非管理员被拒绝。
9. demo 模式行为不变（无邀请按钮，因为 `adminUserService` 为 undefined）。
