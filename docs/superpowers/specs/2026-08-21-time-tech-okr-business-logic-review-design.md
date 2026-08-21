# 瞬谱光电 OKR 业务逻辑重构设计

**日期：** 2026-08-21  
**公司：** 南京瞬谱光电科技有限公司  
**品牌：** 瞬谱光电 / TIME-TECH SPECTRA

## 目标

将系统收敛为可供真实组织使用的 OKR 管理、Daily OKR Report、工时记录和管理仪表盘。此次工作以业务权限、数据一致性和跨角色可见性为核心，不是单纯的界面改名或布局调整。

系统不得向生产数据库注入虚构用户、邮箱、Objective、KR 或日报。需求中出现的张伟、王芳、李明和陈浩仅用于描述验收场景；只有当这些用户已经通过真实注册和管理员审批存在于数据库中时，才会出现在负责人选择列表中。

## 角色与权限

### Administrator

Administrator 是系统管理员，只负责账号和组织角色管理：审批用户、启停用户，并把真实用户定义为 Management、Project Leader、Employee 或其他受支持角色。Administrator 不能创建、修改、归档或恢复公司级 Objective，也不能代替 Project Leader 管理 KR。

### Management

Management 是唯一能够创建、修改、归档和恢复季度公司级 Objective 的角色。创建 Objective 时必须指定一名组织内已审批、启用且角色为 Project Leader 的真实用户。Objective 创建后，该 Project Leader 自动成为底层项目成员。

### Project Leader

Project Leader 可以查看分配给自己的 Objective，但不能修改 Objective 的标题、周期、负责人、优先级或描述。只有 Objective 的负责人可以在其下创建或修改 KR，并为 KR 分配负责人。

KR 负责人候选范围是同一组织内所有已审批、启用且角色为 Project Leader 或 Employee 的真实用户，不要求候选人预先属于项目。数据库在同一事务中先确保每位负责人存在于 `project_members`，再写入 `kr_assignments` 的 `OWNER` 关系。跨组织、未审批、已停用或角色不合格的用户必须被拒绝。

### Employee

Employee 可以看到自己负责 KR 所属的 Objective、自己的 KR、进度记录和本人日报。Employee 可以更新自己负责 KR 的进度，并在 Daily OKR Entry 中关联自己负责的 KR。Employee 不能创建或修改 Objective，也不能创建或重分配 KR。

## OKR 信息架构

用户可见的对齐结构统一为：

```text
Objective
└── KR
```

现有的 `project` 继续作为成员、权限、日报和数据关联的底层容器，但不再在 OKR 对齐树中显示为“项目目标”。删除“公司 O → 项目目标 → Objective”造成的语义重复。Objective 节点直接显示负责人和完成率，KR 节点显示负责人和完成率。

## KR 分配事务

创建或修改 KR 时，数据库按以下顺序原子执行：

1. 根据 Objective 解析组织和底层项目，不信任前端传入项目标识。
2. 验证当前用户是该 Objective 的 Project Leader。
3. 验证每位负责人属于同一组织、已审批、已启用，且角色为 Project Leader 或 Employee。
4. 对每位负责人向 `project_members` 执行幂等插入。
5. 创建或更新 KR，并维护 `key_results.owner_id` 的兼容负责人字段。
6. 写入完整的 `kr_assignments` OWNER 集合。

任一验证或写入失败时，整个事务回滚，不允许出现负责人关系与项目成员关系不同步。

## Daily OKR Report

一名用户在同一组织、同一日期只能有一份 Daily Report。每份报告包含一个或多个有顺序的 Daily OKR Entry。每个 Entry 包含：

- Today's Objective
- Related company Objective（由关联 KR 推导并展示）
- Related KR
- Work description
- Result / Data
- Attachments
- Working hours

附件归属于具体 Entry。完成第一个有效 Entry 后才显示“Add another Daily OKR”按钮；新增 Entry 后，每个区块独立校验、独立管理附件，整份日报汇总工时。

提交由数据库原子保存函数处理：按 `(organization_id, author_id, report_date)` 查找当天报告。不存在则创建；已存在则锁定该报告、追加新修订并更新当前版本。前端无论从新建入口还是已有报告入口提交，都使用同一保存语义，从根源上消除 `23505 daily_reports_organization_id_author_id_report_date_key` 冲突。并发提交通过行锁和唯一约束收敛为一份报告，不创建重复记录。

## Dashboard

Management Dashboard 展示：

- 公司 Objective 及其 Project Leader
- Objective 完成率
- KR 完成率
- 员工已登记工时
- 项目进度
- Objective → KR 对齐关系

Project Leader 和 Employee Dashboard 继续遵循数据可见范围，只显示本人负责或参与的数据。修复 Project Leader Dashboard 缺失 OKR 对齐摘要的现有测试失败。

系统不再展示 Available Capacity、Resource Utilization、Risk Matrix、风险创建入口或风险相关 Dashboard 组件。风险表和历史数据先保留在数据库中，但产品运行路径不再读取、创建、修改或展示风险，避免在本次重构中进行不可逆数据删除。状态计算不得再依赖风险事件。

## 品牌与文案

所有用户可见的 Northstar 品牌替换为“瞬谱光电”或“TIME-TECH SPECTRA”，公司全称使用“南京瞬谱光电科技有限公司”。应用标题、登录、注册、侧边栏、页面元数据、说明文档和中英文文案均纳入检查。内部历史迁移文件和 Git 历史不做无意义改写，但运行时不得显示 Northstar。

## 真实数据原则

- 不创建虚构认证账号或邮箱。
- 不向生产数据库写入需求示例人员或示例 OKR。
- 不假设张伟、王芳、李明或陈浩已经存在。
- 所有负责人选择均来自数据库当前组织的真实、有效、已审批用户。
- 自动化测试使用隔离的 fixture、mock repository 或本地 Supabase 测试事务，不污染生产数据。
- Demo mode 如继续保留，仅用于本地界面测试，不作为真实持久化或生产验收证明；本次不新增需求示例数据。

## 错误处理与安全

前端权限仅控制可见按钮和交互提示，Supabase RPC 与 RLS 是最终安全边界。错误响应区分未授权、无效负责人、并发版本冲突和通用保存失败。选择器不得泄露其他组织用户；Employee 不得通过直接 URL 读取无关 Objective、KR 或日报正文。

附件上传失败时不得提交引用无效附件的 Entry。日报保存和附件归属应保持可重试：已有日报再次提交更新同日报，而不是创建第二份。

## 测试与验收

实施采用测试先行，并在修改前的基线结果之上增加以下场景：

1. Administrator 审批真实用户并分配角色，同时无法创建或修改 Objective。
2. Management 创建 Objective 并指定 Project Leader；负责人自动成为项目成员。
3. Project Leader 能查看 Objective、不能编辑 Objective，能创建 KR。
4. KR 选择器显示所有组织内合格的真实用户，包括尚未加入项目的 Employee。
5. 创建 KR 后，OWNER 和 `project_members` 同步生成；非法用户使事务整体失败。
6. Employee 能看到自己的 Objective、KR 和进度，不能看到无关业务正文。
7. Employee 创建包含完整字段和 Entry 内附件的 Daily OKR Report，并记录工时。
8. 同一用户同一天再次提交时更新原报告并增加修订，不触发 `23505`，报告总数仍为一。
9. Management Dashboard 展示 Objective、Project Leader、KR 进度、员工工时和项目进度，不出现容量、利用率或风险组件。
10. 对齐树只显示 Objective → KR，不再出现“项目目标”重复层。
11. 运行时品牌不再出现 Northstar。
12. 验证角色切换后的数据同步：Management 创建的数据对负责人可见，Project Leader 分配的 KR 对 Employee 可见，Employee 工时回流 Management Dashboard。

优先使用现有 Vitest/Testing Library 和 Supabase SQL 测试。项目当前未安装 Playwright，因此不为本次工作引入浏览器框架；若本地 Supabase 可运行，则补充并执行数据库测试。最终执行完整单元/组件测试、类型检查和生产构建，并明确区分通过、失败和因环境缺失未执行的项目。

## 非目标

- 不创建或猜测员工邮箱。
- 不注入生产演示数据。
- 不删除历史风险数据表。
- 不在本次重新定义 Administrator 的角色修改能力。
- 不引入与 OKR、日报、工时和 Dashboard 无关的新功能。
