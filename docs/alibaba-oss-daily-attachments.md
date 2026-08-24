# 日报附件 OSS 生产部署

日报附件的结构化元数据仍保存在 Supabase/PostgreSQL，文件内容只保存在私有阿里云 OSS。资源与耗材附件仍使用 Supabase Storage，不受本方案影响。

## 运行时配置

生产密钥只放在 ECS 的 `/var/www/timetech-okr/.env.production.local`，不要写入 Git 或任何 `VITE_` 变量。服务读取以下变量：

```text
OSS_ACCESS_KEY_ID
OSS_ACCESS_KEY_SECRET
OSS_BUCKET
OSS_REGION
OSS_ENDPOINT
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
ATTACHMENT_API_HOST=127.0.0.1
ATTACHMENT_API_PORT=3001
```

`SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 未单独配置时，会兼容读取现有服务端进程环境中的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。密钥不得输出到日志。

## 构建与 systemd

```bash
cd /var/www/timetech-okr
npm ci
npm run build:production
npm run server:build
```

创建 `/etc/systemd/system/timetech-attachment-api.service`：

```ini
[Unit]
Description=TIME-TECH daily report attachment API
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

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now timetech-attachment-api
curl -fsS http://127.0.0.1:3001/api/health
```

## Nginx

在 `okr.trspectra.com` 的 HTTPS `server` 块中加入：

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

验证后重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://okr.trspectra.com/api/health
```

## OSS 设置

- Bucket 必须为私有。
- RAM 身份只授予该 Bucket 所需对象前缀的 PutObject、GetObject、DeleteObject 权限。
- CORS 来源只允许 `https://okr.trspectra.com`。
- CORS 方法允许 `PUT`、`GET`、`HEAD`；请求头允许 `Content-Type`；暴露 `ETag`。
- 浏览器取得的签名上传地址有效期为 5 分钟，下载地址有效期为 60 秒。

## 部署验证

1. 无登录令牌访问 `/api/attachments/...` 应返回 401。
2. 选择附件后进度条到 99%，服务端 HEAD 校验完成后才显示 100% 并允许提交。
3. 日报附件上传和下载请求指向 OSS 签名地址；资源与耗材附件仍指向 Supabase Storage。
4. 跨组织或权限不足的附件签名请求必须返回 403。
5. 删除未提交附件后，OSS 对象与 PostgreSQL 生命周期状态均完成清理。
