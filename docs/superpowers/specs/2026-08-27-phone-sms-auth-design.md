# 手机号与短信认证设计

**日期：** 2026-08-27

**状态：** 已完成产品确认，等待实施计划

**目标系统：** TIME-TECH SPECTRA OKR

**生产认证平台：** 阿里云托管 RDS Supabase Auth

## 1. 目标

在不影响现有邮箱账号的前提下，为系统增加中国大陆手机号认证：

- 新用户可以使用姓名、手机号、短信验证码和密码注册。
- 已有用户可以使用手机号与密码登录。
- 已有用户可以使用手机号与短信验证码登录。
- 现有邮箱注册、邮箱密码登录和邮箱找回密码继续保留。
- 现有邮箱用户验证绑定手机号后，邮箱与手机号指向同一个 Auth 用户和 profile。
- 手机号注册成功后仍需管理员审批，短信验证不能绕过组织、角色和项目分配。
- 短信未配置好或发生故障时，可以通过功能开关隐藏短信入口，邮箱流程仍可使用。

第一版只支持中国大陆 `+86` 手机号。

## 2. 非目标

- 不自建 OTP 生成、存储或校验服务。
- 不把阿里云 AccessKey 放入前端、GitHub、应用服务器环境或项目数据库。
- 不删除邮箱字段、邮箱用户或邮件认证流程。
- 不在第一版支持国际区号选择。
- 不允许短信登录入口隐式创建新账号。
- 不改变现有管理员审批、停用、角色、项目或 RLS 安全边界。

## 3. 技术方案选择

采用阿里云 RDS Supabase 原生 **Alibaba Cloud SMS Provider**。

RDS Supabase Auth 负责：

- OTP 生成、有效期和校验；
- 手机号认证身份及唯一性；
- 密码哈希；
- session 和 refresh token；
- 认证限流；
- `auth.users.phone` 的权威状态。

阿里云短信服务负责短信投递。使用一个专用 RAM 用户，其 AccessKey 具备：

- `AliyunDysmsFullAccess`
- `AliyunDypnsFullAccess`

AK/SK 仅填写在 `RDS Supabase → Auth配置 → 手机号 → 阿里云 SMS Provider`。SMS Webhook 保留为未来替换路径，第一版不部署 Function Compute Webhook。

官方参考：

- <https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/use-sms-webhook-or-sms-provider-to-configure-sms-based-authentication-for-rds-supabase>
- <https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/authentication>

## 4. 身份模型

`auth.users` 是认证身份的权威来源：

- `auth.users.phone` 保存已验证、标准化的 E.164 手机号，例如 `+8613812345678`。
- `auth.users.email` 保存现有或新邮箱身份。
- 一个 Auth 用户可以同时具有 email 和 phone。
- 绑定手机号不能创建第二个 profile；业务身份始终以 Auth 用户 UUID 为主键。
- `raw_user_meta_data.display_name` 保存手机号注册时填写的姓名，供 profile 初始化使用。

`public.profiles` 是业务资料镜像，增加：

- `phone text`：已验证手机号的业务侧镜像，可空。
- `phone_verified_at timestamptz`：手机号最近一次确认时间，可空。
- `pending_phone text`：管理员录入、等待员工本人验证的候选联系号码，可空；不能用于登录或显示为“已验证”。

手机号唯一性由 Auth 层首先保证，业务表同时建立只针对非空手机号的唯一约束或唯一索引，阻止漂移。`profiles.email` 暂时继续使用现有的非空空字符串兼容模型；手机号用户没有邮箱时保存 `''`，避免破坏既有查询和 RPC。

管理员可以把号码写入 `pending_phone`，但不能直接将其标记为登录身份。只有用户本人完成 Supabase Auth 的短信验证后，才能把 Auth 中的号码同步为已验证的 `profiles.phone` 并清空匹配的 `pending_phone`。

## 5. 登录与注册界面

### 5.1 登录页

登录页默认显示手机号方式，并提供三个标签：

1. 手机号 + 密码
2. 短信验证码
3. 邮箱 + 密码

手机号输入固定显示 `+86`，用户输入 11 位大陆手机号。提交前统一标准化为 E.164。

短信验证码标签使用：

```ts
supabase.auth.signInWithOtp({
  phone,
  options: { shouldCreateUser: false },
})
```

`shouldCreateUser: false` 是强制安全要求，避免登录入口绕过注册资料和管理员审批创建账号。

### 5.2 注册页

默认手机号注册字段：

- 姓名
- `+86` 手机号
- 短信验证码
- 密码
- 确认密码

保留“使用邮箱注册”次级入口。手机号注册先由 Supabase Auth 建立待验证用户并发送 OTP，验证成功后初始化或补全 profile，状态为 `pending`。

### 5.3 通用验证码控件

新增可复用 `SmsCodeInput`：

- 六位验证码输入；
- 发送按钮；
- 60 秒前端倒计时；
- 重新发送；
- 请求中、限流、错误和过期状态；
- 不记录、不缓存、不上报 OTP 内容。

前端倒计时仅改善体验，真正的发送限流和 OTP 有效期以 Supabase Auth 为准。

## 6. 用户流程

### 6.1 手机号注册

```text
填写姓名、手机号、密码
→ 请求发送 OTP
→ 输入 OTP
→ Supabase verifyOtp
→ 初始化/补全 profile
→ approval_status = pending
→ 显示等待管理员审批
```

手机号验证只证明号码控制权，不赋予组织业务权限。

### 6.2 手机号密码登录

```text
标准化手机号
→ signInWithPassword({ phone, password })
→ 读取 profile 状态
→ active 且 approved 才进入业务系统
```

### 6.3 短信验证码登录

```text
输入已有手机号
→ signInWithOtp({ shouldCreateUser: false })
→ verifyOtp({ type: 'sms' })
→ 读取 profile 状态
→ active 且 approved 才进入业务系统
```

未注册号码不创建账号。界面提示其走注册入口，但认证错误文案不得泄露额外的组织成员信息。

### 6.4 现有邮箱用户绑定手机号

```text
邮箱登录
→ 个人资料选择绑定手机号
→ 请求并验证 OTP
→ Supabase Auth 将 phone 绑定到当前 UUID
→ 安全 RPC 从 auth.users 同步 profiles.phone
```

管理员可以录入候选联系号码，但员工本人必须完成 OTP 验证。绑定成功前，该号码不能用于登录。

### 6.5 手机号找回密码

```text
输入已注册手机号
→ 发送 OTP，禁止创建用户
→ verifyOtp 获得短期 session
→ 强制进入设置新密码页面
→ updateUser({ password })
→ 完成后退出恢复态并重新登录
```

邮箱账号继续使用现有邮件重置密码流程。“忘记密码”根据当前登录标签进入相应流程。

## 7. Profile 初始化与同步

现有初始化逻辑不能再假设 `auth.users.email` 必然存在：

1. 姓名优先读取 `raw_user_meta_data.display_name`。
2. 若姓名为空且存在 email，使用现有邮箱 local-part 回退。
3. 若只有 phone，使用脱敏号码回退，例如 `138****5678`。
4. `profiles.email` 使用 Auth email 或 `''`。
5. `profiles.phone` 只能使用当前 Auth 用户已经确认的 phone；`pending_phone` 永远不能作为认证依据。
6. 同步已验证 phone 后清空匹配的 `pending_phone`。
7. 审批、更新、停用和删除继续使用 UUID，不使用 email 或 phone 作为业务主键。

待审批用户和组织用户的数据契约扩展为同时返回：

- `email`
- `phone`
- `phoneVerifiedAt`
- 可推导的认证方式

## 8. 页面和模块变更范围

- `AuthContext`：提供 email/phone 统一身份展示及新增认证操作。
- `SupabaseAuthProvider`：封装手机号注册、密码登录、OTP 发送/验证、手机号绑定和手机号恢复密码。
- `LoginForm`：三标签登录，默认手机号。
- `RegisterForm`：手机号默认注册，邮箱次级注册。
- `ForgotPassword`：手机号 OTP 恢复与邮箱邮件恢复两条路径。
- 新增 `SmsCodeInput`：复用发送和倒计时交互。
- `ProfilePage`：显示、脱敏和绑定手机号。
- `AccountMenu`：优先姓名，身份副标题优先已验证手机号，其次邮箱。
- `UsersPage` / 用户表单：显示手机号和验证状态；管理员录入候选号码不能伪造验证。
- i18n：补齐中英文手机号、验证码、限流、审批和错误文案。

认证 UI 与 Supabase 调用分离。组件只处理表单状态，Provider 负责 Auth API，手机号格式化和错误映射放入独立纯函数模块，便于测试和未来切换 SMS Webhook。

## 9. 安全规则

- OTP 不写入项目数据库、日志、analytics、错误报告或本地持久化存储。
- AK/SK 不进入源代码、Git、前端 bundle、应用服务器或任何 `VITE_*` 变量。
- 手机号统一存储为 E.164，展示时脱敏。
- 修改或绑定手机号必须重新完成 OTP。
- 短信登录必须禁止自动创建账号。
- Auth session 不能绕过现有 `ProtectedRoute`、profile active/approval 检查或数据库 RLS。
- 账号停用后，即使仍持有 Auth session，也不能访问业务数据。
- 错误映射不暴露组织成员关系或内部账号状态细节。
- 数据库同步 RPC 必须依据 `auth.uid()` 与 `auth.users`，不信任调用者提交的手机号或验证时间。

## 10. 错误处理

用户可理解的错误类别：

- 验证码发送过于频繁；
- 验证码错误或已过期；
- 手机号或验证信息不正确；
- 账号等待管理员审批；
- 账号已停用；
- 短信服务暂不可用；
- 手机号已绑定其他账号；
- 密码不符合要求；
- 网络请求超时。

底层 provider 错误统一映射，不直接把供应商响应、request payload、手机号全值或凭据展示给用户。发送失败时保留当前表单内容，允许稍后重试或切换邮箱登录。

## 11. 功能开关与配置

新增公开前端开关：

```text
VITE_PHONE_AUTH_ENABLED
VITE_PHONE_REGISTRATION_ENABLED
```

- 两者默认 `false`。
- `PHONE_AUTH` 控制手机号密码登录、短信登录和已登录用户绑定入口。
- `PHONE_REGISTRATION` 只有在 `PHONE_AUTH` 开启时才可生效，控制公开手机号注册。
- 关闭开关只隐藏入口，不删除已绑定手机号或改变数据库结构。
- 生产配置校验脚本应验证布尔值格式，但不得要求或读取 SMS AK/SK。

## 12. 阿里云配置

正式启用前，在 RDS Supabase Auth 配置中完成：

- SMS Provider：`aliyun`；
- 专用 RAM 用户 AccessKey ID / Secret；
- SMS 地域；
- 已审核短信签名；
- 已审核验证码模板 CODE；
- SMS 自动确认关闭；
- OTP 有效期与发送频率；
- 实例允许访问公网。

配置变更可能触发托管实例重启。必须在维护窗口操作，等待控制台恢复“运行中”并完成独立测试后，才能开启前端功能开关。

## 13. 上线顺序

1. 提交数据库 forward migration、认证抽象和隐藏状态下的前端实现。
2. 本地及隔离测试环境完成数据库、Auth mock、组件和构建验证。
3. 部署代码，但保持两个手机号开关为 `false`。
4. 在阿里云配置原生 SMS Provider，并使用测试手机号验证发送与 OTP 校验。
5. 开启 `VITE_PHONE_AUTH_ENABLED=true`，先验证现有邮箱账号绑定手机号和两种手机号登录。
6. 验证稳定后开启 `VITE_PHONE_REGISTRATION_ENABLED=true`。
7. 登录页将手机号设为默认，邮箱登录保持次级标签。
8. 观察发送失败、限流、OTP 验证、注册完成和管理员审批情况。

回滚前端时关闭两个开关并重新构建。数据库新增字段保留，不执行破坏性回滚；邮箱登录始终可用。

## 14. 测试与验收

### 单元与组件测试

- 中国大陆手机号验证、E.164 格式化和脱敏。
- 登录标签切换及默认选择。
- OTP 倒计时、重复发送和错误恢复。
- 手机号注册、验证和 pending 页面。
- 手机号密码登录。
- OTP 登录设置 `shouldCreateUser: false`。
- 邮箱注册、登录和恢复流程不回归。
- 手机号找回密码强制更新密码。
- Profile 和 AccountMenu 的身份展示。
- 功能开关关闭时不显示手机号入口。

### 数据库测试

- 手机号 profile 同步只允许当前用户从 Auth 身份同步。
- 重复手机号被拒绝。
- 未验证候选号码不能成为登录身份。
- 手机号用户能初始化 profile，email 可为空字符串。
- pending、inactive 和跨组织访问继续被拒绝。
- 审批、角色和项目 RPC 继续按 UUID 工作。

### 端到端验收

- 新手机号注册 → OTP → pending → 管理员审批 → 登录。
- 现有邮箱用户登录 → 绑定手机号 → 两种身份登录同一 UUID。
- 已有手机号使用密码及 OTP 登录。
- 未注册手机号通过 OTP 登录不会创建 Auth 用户。
- 停用用户不能进入业务系统。
- 手机号 OTP 找回密码后旧密码失效。
- 短信服务关闭或失败时邮箱登录可用。
- 生产 bundle 不包含 AK/SK、service-role 或数据库秘密。

## 15. 完成标准

功能只有在以下条件全部满足时才算完成：

- 数据库 forward migration 可在 clean 和现有 schema 上安全应用。
- 全部现有测试及新增认证测试通过。
- 邮箱用户无迁移中断。
- 手机号注册、两种登录、绑定和找回密码均通过测试。
- 管理员审批和停用规则无法被 OTP 绕过。
- 阿里云 SMS Provider 在维护窗口内独立验证成功。
- 两个功能开关可以安全灰度和回滚。
- 生产前端 bundle 不含任何短信 AccessKey 或 Secret。
