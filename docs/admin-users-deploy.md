# Phase 1 · 账户与管理员用户管理 — 部署说明

本阶段新增「账户菜单」「用户与权限」页面，以及管理员审批/编辑/停用用户的能力。
生产环境由数据库 RLS、受限 SECURITY DEFINER RPC，和一个 admin-only Edge Function 共同保证安全。

## 1. 变更内容

| 层 | 内容 |
|---|---|
| 数据库 | 新增 `profiles.department`、`profiles.job_title`、`profiles.email` 列；四个受限 RPC：`get_my_profile_state`、`approve_pending_user`、`update_user_profile`、`set_user_active`；一条管理员读取 `project_members` 的 RLS policy。 |
| Edge Function | 新增 `admin-users`，仅管理员可调用，用于读取尚未分配 profile 的 `auth.users`。 |
| 前端 | 顶栏账户菜单（仅 Supabase 模式）、`/users` 用户与权限页、`/profile` 个人资料页、`inactive` 认证状态、i18n 补齐。 |

## 2. 迁移顺序

按顺序应用 `supabase/migrations/` 下的文件（第 5 个为本阶段新增）：

1. `202608130001_core_schema.sql`
2. `202608130002_security.sql`
3. `202608130003_storage.sql`
4. `202608140001_real_kr_risk_i18n.sql`
5. `202608170001_admin_users.sql`

本地验证：

```bash
npx supabase db reset --yes
npx supabase test db
npx supabase db lint
```

生产应用（务必先 `--dry-run` 确认只包含上述五个迁移，且目标 ref 正确）：

```bash
npx supabase login
npx supabase link --project-ref eomesxviqudmowgwftnn
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase db lint --linked
```

## 3. 部署 Edge Function

```bash
npx supabase functions deploy admin-users --project-ref eomesxviqudmowgwftnn
```

`admin-users` 使用 Supabase Edge Runtime 自动注入的三个环境变量，**无需手工配置 secret**：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

安全边界：service-role key 只存在于 function 的服务端环境，绝不出现在前端 bundle、Vite env 或浏览器请求中。function 先用 anon key + 调用方 JWT 校验身份，再通过 RLS 确认调用者是 `administrator`，最后才用 service role 枚举 `auth.users`，且只返回 `id / email / createdAt / lastSignInAt` 四个字段。

## 4. 是否需要手工 Supabase Dashboard 操作

- **首个管理员**：已在之前的阶段创建并可用，本阶段无需重复操作。
- **新用户**：通过登录页 / Supabase Auth 注册（或管理员在 Auth 后台创建）后，会自动出现在「待分配用户」列表，无需在 Dashboard 手工分配。
- **存量用户邮箱回填**：本阶段之前已批准的用户，其 `profiles.email` 默认为空（`email` 是新增列）。当前登录者自己的邮箱来自 session（账户菜单/个人资料始终正确）。如需在「已启用用户」列表为存量用户回填邮箱，可在获得批准后执行一次性 SQL（仅回填，不改写登录邮箱）：

```sql
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email = '';
```

> 该语句需要在能访问 `auth.users` 的上下文（如 SQL Editor 的管理员角色）执行；它属于可选的一次性回填，不是迁移的一部分。

## 5. 验证清单

1. 管理员登录后，右上角出现「头像 + 姓名 + 角色」账户菜单，可查看个人资料、退出登录。
2. 非管理员导航中不出现「用户与权限」；直接访问 `/users` 返回通用「访问受限」页。
3. 管理员在「用户与权限」看到「待分配用户」与「已启用用户」两块。
4. 对新注册用户点击「配置并批准」，填写姓名/部门/职位/角色后批准，`profiles` 与 `user_roles` 原子写入。
5. 新用户重新登录后被识别为对应角色；停用后再次登录显示「账户已停用」，而非「等待管理员分配」。
6. 管理员可编辑成员角色/部门/职位，可停用/启用，且不能停用或降级自己。

## 6. 多租户注意

未分配用户（尚无 profile）在当前模型下没有组织归属。单组织部署（当前生产环境）不受影响；未来多租户应改用 org-scoped 邀请链接，把待分配用户绑定到具体组织，避免跨组织看到未分配邮箱。
