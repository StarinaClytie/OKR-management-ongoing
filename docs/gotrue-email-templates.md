# GoTrue 邮件模板 — 存放与部署说明

本方案为自托管 Supabase Auth（GoTrue）的邮件模板提供**静态 HTML 模板 + URL 拉取**的存放方式。
模板放在 Vite 的 `public/email/` 目录，构建时原样复制到 `dist/email/`，由 Nginx 以静态文件对外提供；
阿里云 ECS 上的 GoTrue 通过 `GOTRUE_MAILER_TEMPLATES_*` 指向这些 URL，在**发送邮件时**拉取 HTML 并
用 Go template 渲染变量。此方案**不修改任何业务代码**，只新增静态文件与本文档。

---

## 1. 工作原理

GoTrue 加载自定义邮件模板的方式是**按 URL 拉取**（不是挂载 Docker 卷）：

1. 设置环境变量 `GOTRUE_MAILER_TEMPLATES_<FLOW>` 为一个**完整 URL**。
2. 每次发送对应类型的邮件时，GoTrue 请求该 URL，取回 HTML 内容。
3. 把内容当作 Go template 渲染，注入变量（`{{ .ConfirmationURL }}` 等）后通过 SMTP 发出。
4. 若 URL 不可达或内容不是合法 Go template，**回退到 GoTrue 内置默认模板**。

> 因为模板在发送时按 URL 拉取，所以**修改 `public/email/` 下的 HTML 并重新构建/发布后即生效**，
> 不需要重启 GoTrue 服务（但需确保 auth 服务能从 ECS 访问到公开的 HTTPS URL）。

### 与 `GOTRUE_MAILER_URLPATHS_*` 的区别（易混淆）

| 变量族 | 含义 | 是否需要配置 |
|---|---|---|
| `GOTRUE_MAILER_TEMPLATES_*` | **模板文件本身的 URL**（本方案配置的对象） | 是 |
| `GOTRUE_MAILER_SUBJECTS_*` | 邮件主题（可含模板变量） | 可选（不设则用默认） |
| `GOTRUE_MAILER_URLPATHS_*` | 邮件里点击链接的**重定向路径**（如默认 `/verify`），拼到 `SITE_URL` 上 | 否（保持默认即可，本方案不涉及） |

`GOTRUE_MAILER_URLPATHS_*` 是「邮件正文里那个链接指向哪」，不是「模板从哪加载」，二者不要混淆。

---

## 2. 目录结构

```
public/email/
├── confirmation.html      # 注册邮箱验证（本应用必需，config.toml 已启用 email confirmation）
├── invite.html            # 管理员邀请（Phase 1.5，必需）
├── recovery.html          # 重置密码（必需）
├── magic-link.html        # 免密登录链接（当前 UI 未暴露，预留）
├── email-change.html      # 更改邮箱确认（当前 UI 未暴露，预留）
└── reauthentication.html  # 敏感操作二次验证码（当前 UI 未暴露，预留）
```

构建后 Vite 会把 `public/*` 原样复制到 `dist/*`，得到：

```
dist/email/confirmation.html → https://<生产站点>/email/confirmation.html
```

生产站点即 `docs/alibaba-rds-supabase-init.md` 中的 `https://okr.trspectra.com`。

> 注意：这些文件位于 `public/` 而不是 `src/`，所以 **Vite 不会对它们做任何打包/注入处理**，`{{ ... }}`
> 语法会原样保留；只有 GoTrue 在发送时解析它们。Nginx 的 SPA 回退 `try_files $uri $uri/ /index.html`
> 会先命中真实存在的 `.html` 文件，不会误落到前端路由。

---

## 3. GoTrue 环境变量映射

生产**前端站点**（即 Auth 的 Site URL，也是模板静态文件所在域）为 `https://okr.trspectra.com`；
Auth API / GoTrue 主机（`VITE_SUPABASE_URL`）为 `https://api.okr.trspectra.com`，二者**不同域**。
模板 URL 必须放在前端站点域上，因为只有前端站点通过 Nginx 提供 `dist/email/*.html`。

域名约定（统一使用 `okr.trspectra.com`）：

- **Site URL**（Auth 配置）：`https://okr.trspectra.com`
- **Redirect URL**（Auth 配置）：至少 `https://okr.trspectra.com/auth/invite`；开发环境另加 `http://localhost:5173/auth/invite`、`http://127.0.0.1:5173/auth/invite`
- **模板 URL**（GoTrue 配置）：`https://okr.trspectra.com/email/<flow>.html`

以下变量只存在于 **ECS 上 GoTrue 的环境变量**，绝不进入仓库、前端 bundle、Nginx 配置或日志。

| 邮件流 FLOW | 模板文件 | `GOTRUE_MAILER_TEMPLATES_<FLOW>` 的值 | `GOTRUE_MAILER_SUBJECTS_<FLOW>`（建议） | 状态 |
|---|---|---|---|---|
| `CONFIRMATION` | `confirmation.html` | `https://okr.trspectra.com/email/confirmation.html` | `瞬谱光电 OKR · 请验证你的邮箱` | 启用 |
| `INVITE` | `invite.html` | `https://okr.trspectra.com/email/invite.html` | `瞬谱光电 OKR · 邀请加入` | 启用 |
| `RECOVERY` | `recovery.html` | `https://okr.trspectra.com/email/recovery.html` | `瞬谱光电 OKR · 重置密码` | 启用 |
| `MAGIC_LINK` | `magic-link.html` | `https://okr.trspectra.com/email/magic-link.html` | `瞬谱光电 OKR · 登录链接` | 预留 |
| `EMAIL_CHANGE` | `email-change.html` | `https://okr.trspectra.com/email/email-change.html` | `瞬谱光电 OKR · 确认新邮箱` | 预留 |
| `REAUTHENTICATION` | `reauthentication.html` | `https://okr.trspectra.com/email/reauthentication.html` | `瞬谱光电 OKR · 验证码 {{ .Token }}` | 预留 |

GoTrue 环境变量名以 `GOTRUE_` 为前缀（例如 `GOTRUE_MAILER_TEMPLATES_CONFIRMATION`、
`GOTRUE_MAILER_SUBJECTS_INVITE`）；`pkg.go.dev` 文档里常省略前缀写成 `MAILER_TEMPLATES_*`，二者指同一个配置。

SMTP 通道（阿里云 DirectMail）由既有的 `GOTRUE_SMTP_*` 配置承担，见
`supabase/config.toml` 的注释与 `docs/alibaba-rds-supabase-init.md`；本方案只补充模板 URL 与主题，
**不重复配置 SMTP 凭据**。

---

## 4. 模板变量

模板是标准 Go `html/template`。各邮件流可用的变量：

| 变量 | 含义 | 出现的模板 |
|---|---|---|
| `{{ .ConfirmationURL }}` | 完成动作的链接（验证 / 邀请接受 / 重置 / 登录 / 改邮箱） | 全部（reauthentication 除外） |
| `{{ .SiteURL }}` | 站点 URL（用于「前往登录」链接） | 全部 |
| `{{ .Email }}` | 收件人原始邮箱（链接匿名用户时为空） | 可选 |
| `{{ .Token }}` | 6 位 OTP 验证码 | `reauthentication.html` |
| `{{ .NewEmail }}` | 更改后的新邮箱 | `email-change.html` |
| `{{ .TokenHash }}` / `{{ .RedirectTo }}` / `{{ .Data }}` | 构造自定义链接 / 重定向 / user_metadata | 需要时再使用 |

主题（`GOTRUE_MAILER_SUBJECTS_*`）同样支持模板变量，例如 reauthentication 的默认主题就是
`{{ .Token }} is your verification code`。

---

## 5. 中英文 i18n 方案

应用本体是「瞬谱光电 · TIME-TECH SPECTRA」双语品牌，登录页品牌行也是双语；GoTrue **不支持按收件人
语言自动切换模板**（每个 FLOW 同一时刻只能有一个模板 URL）。因此采用**单模板双语**：每个邮件里
中文为主、英文为辅（标题下给英文副标题、正文中英并列、CTA 按钮中英并排），与产品双语风格一致。

如果将来需要按收件人语言真正分流，可选做法是给 `auth.users.user_metadata` 写入 `locale`，并在模板
里用 Go template 条件渲染（务必加 `.Data` 空值保护）：

```html
{{ if and .Data (eq .Data.locale "en") }}
  <p>English copy…</p>
{{ else }}
  <p>中文文案…</p>
{{ end }}
```

但当前用户注册/邀请流程**没有**写 `locale` 元数据，故本方案暂不启用条件渲染，保持「单文件双语」，
避免引入对元数据的隐性依赖。

---

## 6. 上线步骤（ECS 侧，非本仓库）

1. 正常构建发布前端，确认 `dist/email/*.html` 已生成，且生产站点可直接访问
   `https://okr.trspectra.com/email/confirmation.html`（返回 HTML，非 SPA 回退页）。
2. 在 ECS 的 GoTrue 环境变量里设置第 3 节表格中的 `GOTRUE_MAILER_TEMPLATES_*` 与
   `GOTRUE_MAILER_SUBJECTS_*`（至少 `CONFIRMATION`、`INVITE`、`RECOVERY` 三项）。
3. 重启/重载 GoTrue 使环境变量生效（若用编排则滚动重启 GoTrue 容器，不要重启数据库）。
4. 用真实流程冒烟：注册 → 收验证邮件 → 点链接验证；管理员邀请 → 收邀请邮件 → 点链接设密码；
   「忘记密码」→ 收重置邮件 → 重置。核对中英文文案、按钮链接、主题与发件人。

### 校验命令（在 ECS 上确认 auth 服务能拉到模板）

```bash
curl -fsS https://okr.trspectra.com/email/confirmation.html | head -5
```

应返回 HTML 而非 404/`index.html`。若 GoTrue 拉不到，会在日志里体现并回退到默认模板——收件人看到的是
英文默认邮件，此时优先排查 DNS/HTTPS 证书/ECS 出网。

---

## 7. 注意事项

- **只在 `public/email/` 加文件**：不要把这些 HTML 放到 `src/` 下通过 import 引用，否则 Vite 会当成
  资源打包、可能改写内容；`public/` 是唯一原样复制的位置。
- **不要删除模板变量**：`{{ .ConfirmationURL }}` 等必须保留，否则链接失效（对照
  `docs/admin-invite-deploy.md` 第 4.2 节的提醒）。
- **秘密不放前端**：模板只含静态文案与变量占位符，不出现 service-role、JWT secret、数据库密码、
  SMTP 凭据或内部 RDS 主机名。
- **主题与模板同域**：模板 URL 用公开 HTTPS 域名，确保 GoTrue（ECS）能从内网/公网访问。
- **回退行为**：模板拉取失败不阻断注册/邀请，但会发默认英文邮件；上线后第 6 节校验不要省略。
