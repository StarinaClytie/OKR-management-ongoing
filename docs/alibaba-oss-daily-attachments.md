# 业务附件 OSS 生产部署

日报与资源附件的结构化元数据、授权和生命周期仍保存在 Supabase/PostgreSQL；**所有通过本发布支持的生产流程新建的业务附件字节**只存入同一个私有阿里云 OSS bucket `timetech-okr-files`。日报对象使用 `organization/{organizationId}/reports/...` 前缀，资源对象使用 `organization/{organizationId}/resources/...` 前缀。路径只由 PostgreSQL 生成；浏览器只持有短时、精确对象的签名 URL。

旧 Supabase Storage 对象和历史测试对象均不迁移，也不提供兼容下载路径。它们不是受支持的新业务附件传输通道。OSS bucket 保持私有，**不需要也不得配置自定义 OSS 域名**；浏览器直接使用短时签名 URL，业务 API 始终走同源 `/api/`。

> 安全门禁：`202608240004` 已撤销资源 Storage 入口；日报历史 Storage metadata RPC 仍在迁移历史中。上线前必须由独立、已审批的 forward-only 安全迁移审计/撤销这些日报旧入口。完成前，不能宣称数据库层已强制阻断全部旧日报 Storage 写入。

> 本文只描述已审批发布窗口内的操作。未完成本地完整验证和人工复核前，不得执行生产 `db push`、重启服务或修改 Nginx/OSS。

## 运行时密钥与单一服务

生产密钥只放在 ECS 运行时环境 `/var/www/timetech-okr/.env.production.local`（或等价的受保护密钥注入），不进入 Git、构建产物、Nginx 配置、日志、`VITE_` 变量或浏览器。唯一的 Node 附件服务同时处理日报和资源附件；不要创建第二个资源附件服务。

```text
OSS_ACCESS_KEY_ID
OSS_ACCESS_KEY_SECRET
OSS_BUCKET=timetech-okr-files
OSS_REGION
OSS_ENDPOINT
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
ATTACHMENT_API_HOST=127.0.0.1
ATTACHMENT_API_PORT=3001
```

`SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 未单独配置时，服务兼容读取已有进程环境中的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。这只是服务端兼容读取，不能把 OSS 或 service-role 密钥改成 `VITE_` 变量。不得记录密钥、JWT、Authorization header、签名 URL 查询串或文件内容。

创建或更新唯一 systemd 单元 `/etc/systemd/system/timetech-attachment-api.service`：

```ini
[Unit]
Description=TIME-TECH attachment API (daily reports and resources)
After=network.target

[Service]
Type=simple
User=ecs-user
WorkingDirectory=/var/www/timetech-okr
EnvironmentFile=/var/www/timetech-okr/.env.production.local
ExecStart=/usr/bin/node /var/www/timetech-okr/dist-server/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## OSS 设置与 CORS

- bucket `timetech-okr-files` 必须为私有；RAM 身份只获得该 bucket 所需对象前缀的 PutObject、GetObject、DeleteObject 权限。
- 不配置自定义 OSS 域名、公开读写或永久下载 URL。
- CORS 来源只允许 `https://okr.trspectra.com`，不得使用 `*`。
- CORS 允许 `PUT`、`GET`、`HEAD`，请求头至少允许 `Content-Type` 和签名请求实际发送的 `x-oss-*` 头；暴露 `ETag`。
- 上传签名有效期为 5 分钟，下载签名有效期为约 60 秒。

在生产浏览器中选择无敏感小文件，确认预检 `OPTIONS` 和实际签名 `PUT` 都返回允许的源、方法和请求头；不要把签名 URL、token 或对象内容写入发布记录。日报与资源各验证一次。

## 经审批的一次部署顺序

以下步骤覆盖资源访问/日报审核变更，以及日报和资源 OSS 变更。每一步失败即停止，不用手工 SQL、`migration repair` 或重新授权旧 Storage RPC 绕过失败。

1. 在待发布 commit 的仓库根目录确认本地完整验证已通过，并从受保护运行时环境注入 `DATABASE_URL`；它不能进入 shell history、Git 或日志。运行 `npx supabase migration list --db-url "$DATABASE_URL"`，逐行核对远端历史。
2. 运行 `npx supabase db push --dry-run --db-url "$DATABASE_URL"`。待执行集合只能是本发布审批的 `202608240001_resource_access.sql`、`202608240002_report_review_notifications.sql`、`202608240003_daily_report_oss_storage.sql` 和 `202608240004_resource_attachment_oss_storage.sql`；若任何额外 migration、漂移或 destructive SQL 出现，停止并对账。
3. 运行 `npx supabase db push --db-url "$DATABASE_URL"`，随后运行 `npx supabase migration list --db-url "$DATABASE_URL"`，确认本地/远端完全一致。不要迁移旧对象或历史测试对象。
4. 构建前端与 Node 服务：

   ```bash
   cd /var/www/timetech-okr
   npm ci
   npm run build:production
   npm run server:build
   ```

5. 重新加载并重启**同一个**附件服务，然后验证 localhost 健康检查：

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable timetech-attachment-api
   sudo systemctl restart timetech-attachment-api
   curl -fsS http://127.0.0.1:3001/api/health
   ```

6. 在站点 HTTPS `server` 块保留一个 `/api/` 代理，校验 Nginx 后重载并检查公网健康端点：

   ```nginx
   location ^~ /api/ {
       proxy_pass http://127.0.0.1:3001;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto https;
       proxy_connect_timeout 10s;
       proxy_read_timeout 120s;
   }
   ```

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   curl -fsS https://okr.trspectra.com/api/health
   ```

7. 用隔离的已批准 QA 账号完成日报和资源各一次上传、HEAD 校验、下载和删除验证。上传进度必须在服务端 OSS HEAD 校验前停在 99%，确认 RPC 成功后才显示 100%。无 token 应为 401，跨组织或无权签名应为 403；支持的生产流程不得调用 Supabase Storage。日报旧 Storage RPC 的撤销/audit 未完成时停止上线。

## 发布后门禁

1. 验证日报签名 URL 仅指向 OSS，并使用 `reports` 前缀；资源签名 URL 仅指向同一 private bucket，并使用 `resources` 前缀。
2. 验证报告/资源详情只显示服务端已确认的对象；OSS HEAD 的大小或 MIME 不匹配时，metadata 不得变为已上传。
3. 验证删除仅在 OSS 删除成功后记录对象终态；OSS 失败必须保持可重试而不是伪造完成。
4. 复核 ECS 运行时环境和构建产物：OSS、service-role、数据库与 JWT 密钥均未暴露给前端、Git、Nginx 或日志。
5. 记录非敏感测试组织、角色、时间、预期/实际结果和请求 ID。未完成浏览器 QA 时，只能报告自动化验证完成，不能宣称生产附件流程已经验收。
