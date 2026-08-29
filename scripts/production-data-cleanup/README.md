# 生产测试业务数据清理操作手册

这套脚本清空项目、OKR、进度、日报、工时、资源、通知和附件元数据，但保留：

- `auth.users`
- `public.organizations`
- `public.profiles`
- `public.user_roles`
- `public.reporting_lines`

它不是 migration，也不会随部署自动运行。生产清理只能由维护人员在维护窗口手工执行。

## 文件和执行位置

| 文件 | 作用 | 执行位置 |
|---|---|---|
| `preview.sql` | 只读统计、附件清单、外键审计 | ECS 上连接 RDS 的 `psql` |
| `purge.sql` | 带保护计数的事务型清理 | ECS 上连接 RDS 的 `psql` |
| `verify.sql` | 只读清理结果验证 | ECS 上连接 RDS 的 `psql` |
| OSS Object 删除 | 删除附件文件本体 | OSS 控制台，或 ECS 上的 `ossutil 2.x` |

这些 SQL 使用 `psql` 的 `\gexec`、变量和失败退出能力，因此不要粘贴到浏览器应用，也不要拆成零散 SQL 逐条运行。阿里云网页 SQL 控制台若不支持这些 `psql` 指令，应按本文在 ECS 使用 `psql`。

## 0. 停止条件

遇到以下任一情况立即停止，不要运行 `purge.sql`：

- RDS 备份任务尚未成功完成。
- 网站仍允许用户写入数据。
- `preview.sql` 出现规格中未审核的新业务表或外键。
- 附件清单中存在不确定是否应删除的 Object。
- 预览所得用户、组织、profile、角色或上下级关系数量不符合预期。
- 无法确认当前 `psql` 连接的确是目标生产 RDS。

## 1. 创建备份并暂停写入

1. 在阿里云 RDS 实例中创建手动备份。
2. 在任务中心确认备份任务状态为成功，而不是等待或执行中。
3. 进入维护窗口，暂停网站写入或暂时停止 Web/API 服务。
4. 保留现有 ECS 部署目录，不需要重新构建前端。

阿里云官方说明：RDS PostgreSQL 手动备份会生成备份任务，应在任务中心检查进度和结果：

<https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance>

## 2. 在 ECS 准备代码和数据库连接

先让服务器上的仓库包含本清理目录，再进入项目目录。下列变量只作用于当前 shell；不要把密码写入 Git、脚本参数或 shell 历史。

```bash
cd /你的/项目目录
git pull --ff-only

export PGHOST='你的RDS PostgreSQL连接地址'
export PGPORT='5432'
export PGDATABASE='postgres'
export PGUSER='数据库管理员账号'
```

连接时使用 `-W` 让 `psql` 交互式询问密码：

```bash
psql -W -c 'select current_database(), current_user, inet_server_addr(), inet_server_port();'
```

逐项确认输出指向目标生产 RDS。不要在命令行写 `PGPASSWORD=...`。

## 3. 运行只读预览

```bash
mkdir -p cleanup-evidence
psql -W -f scripts/production-data-cleanup/preview.sql \
  | tee cleanup-evidence/preview-before.txt
```

从输出最上方记录五个保留数量：

```text
auth.users
public.organizations
public.profiles
public.user_roles
public.reporting_lines
```

另存精确 OSS Object Key 清单：

```bash
psql -W -At -c "
select storage_path from public.report_attachments where storage_path is not null
union
select storage_path from public.resource_attachments where storage_path is not null
order by 1;
" > cleanup-evidence/attachment-object-keys.txt

wc -l cleanup-evidence/attachment-object-keys.txt
sed -n '1,20p' cleanup-evidence/attachment-object-keys.txt
```

如果清单为空，可以跳过 OSS 删除；如果不为空，继续下一节。

## 4. 删除 OSS 中的精确附件 Object

推荐优先使用 OSS 控制台，逐个搜索并删除 `attachment-object-keys.txt` 中的精确 Object Key。不要删除 Bucket，也不要对 `organization/` 运行递归删除。

使用 `ossutil 2.x` 时，先配置最小权限凭据，再设置实际 Bucket 名称：

```bash
readonly CLEANUP_OSS_BUCKET='timetech-okr-files'
```

先逐个检查 Object 是否存在，不产生删除：

```bash
while IFS= read -r object_key; do
  test -n "$object_key" || continue
  ossutil stat "oss://${CLEANUP_OSS_BUCKET}/${object_key}"
done < cleanup-evidence/attachment-object-keys.txt \
  | tee cleanup-evidence/oss-stat-before.txt
```

核对数量和路径后，才逐个删除精确 Object：

```bash
while IFS= read -r object_key; do
  test -n "$object_key" || continue
  ossutil rm "oss://${CLEANUP_OSS_BUCKET}/${object_key}"
done < cleanup-evidence/attachment-object-keys.txt \
  | tee cleanup-evidence/oss-delete.txt
```

再次运行 `stat` 检查时，所有清单对象都应返回不存在。若 Bucket 开启版本控制，普通删除可能只产生 Delete Marker；如需清除历史版本，必须先单独审查版本清单，不能把 `--all-versions` 加到上述批量循环。

阿里云官方警告 Object 删除可能无法恢复，并说明 `rm` 删除单个 Object 需要 `oss:DeleteObject` 权限：

<https://help.aliyun.com/zh/oss/developer-reference/rm>

`ossutil 2.x` 支持 `--dry-run`，但本流程使用逐个 `stat` 和精确 Object Key，避免任何递归前缀删除：

<https://help.aliyun.com/zh/oss/developer-reference/overview-59/>

## 5. 设置保护计数并清理数据库

把第 3 节记录的五个整数填入当前 shell。以下示例中的数字仅为格式示例，必须替换成生产预览的真实结果：

```bash
EXPECTED_AUTH_USERS=10
EXPECTED_ORGANIZATIONS=1
EXPECTED_PROFILES=10
EXPECTED_USER_ROLES=10
EXPECTED_REPORTING_LINES=6
```

先人工对照一次：

```bash
printf '%s\n' \
  "auth.users=${EXPECTED_AUTH_USERS}" \
  "organizations=${EXPECTED_ORGANIZATIONS}" \
  "profiles=${EXPECTED_PROFILES}" \
  "user_roles=${EXPECTED_USER_ROLES}" \
  "reporting_lines=${EXPECTED_REPORTING_LINES}"
```

确认后执行唯一一次清理事务：

```bash
psql -W \
  -v expected_auth_users="$EXPECTED_AUTH_USERS" \
  -v expected_organizations="$EXPECTED_ORGANIZATIONS" \
  -v expected_profiles="$EXPECTED_PROFILES" \
  -v expected_user_roles="$EXPECTED_USER_ROLES" \
  -v expected_reporting_lines="$EXPECTED_REPORTING_LINES" \
  -f scripts/production-data-cleanup/purge.sql \
  | tee cleanup-evidence/purge.txt
```

只有看到以下内容才表示事务已经提交：

```text
CLEANUP COMMITTED: preserved counts matched and all approved business tables are empty.
```

任何 `ERROR` 都会让 `psql` 停止，数据库事务回滚。此时不要重复尝试；保存完整输出并分析不匹配项。

## 6. 验证并恢复网站

```bash
psql -W -f scripts/production-data-cleanup/verify.sql \
  | tee cleanup-evidence/verify-after.txt
```

确认：

- 所有业务表数量为 `0`。
- 五个保留数量与清理前完全一致。
- 附件 Object 清单在 OSS 中均不存在。
- 管理员、项目负责人、员工、HR 等保留账号仍可登录。
- 仪表盘、OKR、项目、报告、工时、资源和通知页面显示正常空状态，而不是权限错误。

完成验证后恢复网站写入。将 `cleanup-evidence/` 留在服务器的受限运维目录中，不要提交 Git，因为它包含生产数量和 Object Key。

## 7. 回滚边界

- `purge.sql` 在提交前发生错误会自动回滚，无需手工恢复数据库。
- 一旦看到 `CLEANUP COMMITTED`，数据库恢复只能通过第 1 节的 RDS 备份完成。
- OSS 删除不属于数据库事务。如果 OSS 没有版本控制或其他备份，Object 删除可能不可恢复。
- 不要通过重新运行 migration 恢复业务数据；migration 只恢复结构，不恢复记录和附件。
