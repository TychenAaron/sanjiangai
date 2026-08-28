# Phase 0 Foundation Audit

> 审计日期：2026-08-28  
> 审计基线：`local-development` / `20130e724eeba373cae1bbf4a55b935e5aa3ae59`  
> 范围：只盘点当前工程运行底座和启动链；不安装 PostgreSQL、Redis、OpenSearch、Qdrant，不改业务代码、数据库迁移、R2、Worker 或 WritingV2。

## 1. Current Runtime Architecture

当前实际技术栈不是 V3.0 计划中的自建私有化基础设施组合，而是 Cloudflare 本地开发基线：

- **前端与应用 runtime**：React 19、Next 兼容路由和 Vinext，开发时由 Vite 8 启动。
- **API**：`app/api/**/route.ts` 作为 edge runtime 路由；请求经 `worker/index.ts` 的 Vinext app-router handler 进入。
- **Worker**：`worker/index.ts` 负责 Worker 入口、图片优化入口和传递绑定；业务 API 通过 `cloudflare:workers` 读取运行时 binding。
- **数据库**：Drizzle ORM 的 SQLite dialect，通过 `db/index.ts` 将 Worker 的 `DB: D1Database` binding 连接为 Cloudflare D1。
- **本地 D1**：Wrangler/Miniflare 数据保存在 `.wrangler/state/v3/d1/`。该目录被 Git 忽略，当前已确认 `0000` 至 `0009` migration 均已应用。
- **对象存储**：Vite 的 Cloudflare 插件在本地创建 Miniflare R2 binding。公共知识资源使用 `BUCKET` / `site-creator-r2`；公文私有参考使用独立 `WRITING_REFERENCES_BUCKET` / `sanjiang-writing-references-local`，本地对象在 `.wrangler/state/v3/r2/`。
- **模型**：知识问答使用 `lib/model-gateway.ts`，智能写作使用 `lib/writing-model-gateway.ts`，均为 OpenAI-compatible `/chat/completions` 客户端。模型未配置时不需要联网即可启动；OA 默认关闭。
- **检索**：D1 中 `document_chunks` 的关键词分段检索与权限过滤；没有向量库、Embedding、Reranker、混合检索或 RRF。

代码证据：`vite.config.ts`、`worker/index.ts`、`db/index.ts`、`drizzle.config.ts`、`wrangler.local.toml`、`lib/rag.ts`、`lib/model-gateway.ts`、`lib/writing-model-gateway.ts`。

## 2. Startup Commands

| 目的 | 当前命令 | 实际结果/限制 |
|---|---|---|
| 安装依赖 | `npm ci`；仓库包装命令为 `npm run install:ci` | `npm run install:ci` 依赖 Bash、`flock`、`curl` 和 GNU `timeout`，不是纯 Windows PowerShell 路径。 |
| 本地开发与 Worker 模拟 | `npm run dev` | 实际启动成功：Vite + Cloudflare Vite 插件，`http://localhost:5173/`；本轮已正常停止。 |
| 本地 D1 migration | `npm run db:migrate:local` | 使用 `wrangler d1 migrations apply DB --local --config wrangler.local.toml`，不访问远程 D1。 |
| 本地测试身份种子 | `npm run db:seed:local:test-users` | 只写入 local D1 的虚构账号。 |
| 本地资料种子 | `npm run db:seed:local:test-documents` | 只写入 local D1 的虚构资料。 |
| 构建 | `npm run build` | 通过 `scripts/build-verified.sh` 依赖 Bash 和 GNU `timeout`；本轮未继续执行，因为当前 `/bin/bash` 不存在。 |
| 生产式启动 | `npm run start` | 使用 shell 风格环境变量赋值，未验证 Windows PowerShell 兼容性。 |
| 全量测试 | `npm test` | 先调用 `npm run build`，因此受同一 Bash/GNU timeout 缺口阻断。 |
| lint | `npm run lint` | 已改为 npm 直接调用本地 ESLint；本轮实际通过，不依赖 Bash。 |
| 无服务离线 verify | `npm run verify:*` 中的 Node 脚本 | 多项已通过，见第 4 节。 |

本地 Worker/Miniflare 不使用单独的 `wrangler dev` npm 脚本；当前已验证的本机入口是 `npm run dev`。

## 3. Infrastructure Matrix

| Component | V3.0 Target | Current Reality | Status | Gap | Decision |
|---|---|---|---|---|---|
| Database | PostgreSQL | 当前为 Cloudflare D1 + Drizzle SQLite dialect；local state 在 `.wrangler/state/v3/d1/` | NOT REQUIRED IN CURRENT DEV BASELINE | PostgreSQL adapter、schema 和迁移均未实现 | 保留 D1 本地基线；集团私有化部署阶段再评估迁移。 |
| Object Storage | MinIO/S3 或等价私有存储 | 当前为 Cloudflare R2 binding；Vite/Miniflare 提供 local R2 | COMPLETE | 生产私有对象存储适配未实现 | 当前本机验收继续使用 local R2；私有化部署时适配 MinIO/S3。 |
| Worker/Queue | Worker 与异步队列 | Worker 入口和 API runtime 已存在；未发现 queue/consumer | PARTIAL | 无异步队列、任务调度或重试 worker | 当前同步处理可保留；需要异步 OCR/大文件时再引入。 |
| Fulltext Search | OpenSearch | 当前为 D1 `document_chunks` 关键词评分 | PARTIAL | 无 OpenSearch、倒排索引或专业排序 | 当前小规模虚构验收可保留；资料规模扩大后迁移。 |
| Vector DB | Qdrant | 未发现向量字段、客户端、collection 或 Embedding 调用 | NOT REQUIRED IN CURRENT DEV BASELINE | 语义检索与向量库未实现 | 与 Embedding/Reranker 一并在检索专项关实施。 |
| Cache | Redis | 未发现 Redis 依赖、连接或缓存层 | NOT REQUIRED IN CURRENT DEV BASELINE | 无缓存、限流计数或会话缓存 | 当前本地单进程开发可保留；并发部署时评估。 |
| Model Gateway | 统一可替换模型路由 | 已有知识问答/写作两套 OpenAI-compatible chat gateway | PARTIAL | 无 alias、Embedding/Reranker 路由、retry、健康检查和统一审计 | 保持已验收网关；后续独立模型路由专项。 |
| Docker | Dockerfile / Compose | 未找到 Dockerfile、Compose 或容器编排 | NOT FOUND | 无容器化本机/私有化启动方式 | 私有化部署准备阶段再补。 |
| Logging | 结构化服务日志 | 有 `audit_logs` 最小业务审计；未找到统一 logger | PARTIAL | 无 JSON 日志、级别、关联 ID、聚合出口 | 作为运维可观测性专项。 |
| request_id | 请求关联 ID | 未找到 `request_id`、`x-request-id` 或 trace middleware | NOT FOUND | 跨 API/审计无法统一追踪 | 可作为最小工程底座修复候选。 |
| health | 存活/就绪检查 | `/api/models/status` 仅显示脱敏模型配置，不探测服务 | NOT FOUND | 无 `/health`、D1/R2/模型就绪检查 | 可作为最小工程底座修复候选。 |
| CI | 自动化验证 | 未找到 `.github`、`.gitlab-ci.yml` 或其他 CI 配置 | NOT FOUND | 无持续集成入口 | 私有化或协作发布前补齐。 |
| `.env.example` | 安全配置示例 | 含写作 `AI_*` 和 OA 占位变量，默认关闭 | PARTIAL | 未列出知识问答 `MODEL_GATEWAY_*` 示例；不影响未启用模型的基本启动 | 文档修订关补齐，不在本轮修改。 |

## 4. Reproducibility

**结论：`PARTIALLY REPRODUCIBLE`**

当前机器已实证：在现有依赖、local D1 state 和 local R2 state 下，`npm run dev` 能启动 Vite、Worker 模拟和本机地址；D1 migration 命令可安全确认已全部应用。

一台只有 Git、Node.js、npm 和项目代码的新 Windows 机器，能够按仓库配置理解基本路径：安装依赖、执行 `npm run db:migrate:local`、执行种子命令、运行 `npm run dev`。但还存在以下可复现性缺口：

1. `npm run install:ci`、`npm run build` 和 `npm test` 仍依赖 Bash，构建还依赖 GNU `timeout`；当前 Windows 环境实际没有 `/bin/bash`。`npm run lint` 已改为直接调用 ESLint 并通过。
2. README 的安装/构建前提主要面向 Linux，Windows 文档重点说明了 `dev` 和 local D1，但没有给出不依赖 Bash 的 lint/build/test 等价命令。
3. 新 checkout 不包含 `.wrangler/state/`，这是正确的本地隔离行为；必须执行 migration 和可选的虚构种子脚本后才有测试数据。
4. `.env` 受 Git 忽略且未在本轮读取。未启用模型和 OA 时基本启动不依赖真实 secret；启用模型时需要受控服务端配置。知识问答网关变量尚未完整出现在 `.env.example`。
5. Vite 本地配置同时模拟公共 `BUCKET` 和私有 `WRITING_REFERENCES_BUCKET`；而 `wrangler.local.toml` 仅显式声明私有参考 bucket。当前已验证的开发入口应保持为 Vite，而不是假定任意 Wrangler 命令等价。

## 5. Blocking Gaps

以下是当前真正阻塞第 0 关“可稳定开发、可验证”验收的项目：

1. **Windows 工具链尚未完全闭环**：`npm run lint` 已修复为直接调用 ESLint 并通过；但 `build`/`test` 仍依赖 Bash 路径和 GNU `timeout`，无法在当前 PowerShell 环境完成完整质量门禁。
2. **缺少最小健康检查**：没有可供本机、CI 或部署探针调用的 health/readiness endpoint，无法自动确认 D1、R2 与应用 runtime 是否就绪。
3. **缺少 request_id 与统一结构化日志**：业务审计存在，但启动、接口异常和基础设施故障缺乏可关联的运行时诊断信息。

PostgreSQL、Redis、OpenSearch、Qdrant、Docker、OCR 和旧 Office 转换不列为当前第 0 关阻塞项：它们属于后续规模化或集团私有化部署能力，当前 Cloudflare 本机基线可继续支撑已验收功能。

## 6. Migration-Later Items

| 项目 | 当前是否必须替换 | 延后理由 |
|---|---|---|
| PostgreSQL | 否 | 当前 schema、Drizzle dialect、migration 和 local D1 已可支持已验收业务；迁移会扩大风险。 |
| Redis | 否 | 当前没有队列、分布式限流或高并发缓存需求的已确认验收项。 |
| OpenSearch | 否 | 当前授权关键词检索和 citations 已验收；专业全文检索应与资料规模目标一起设计。 |
| Qdrant | 否 | 当前无 Embedding/Reranker；先引入向量库会留下无调用的基础设施。 |
| MinIO/S3 | 否 | 本机 Miniflare R2 已满足本地验证；生产私有对象存储需结合集团环境、权限和备份策略适配。 |
| Docker / Compose | 否 | 当前工作流是 Vite + Miniflare；容器化应与私有化部署拓扑一并确定。 |
| OCR / 旧 PPT 转换 | 否 | 需要可信的服务端处理环境；目前资料状态已安全标记为待处理，不会误入正式检索。 |

## 7. Protected Stable Modules

本轮未修改且后续基础设施修复不得破坏：

- WritingV2 冻结基线：`3bafa75089273fb7d9023f4f831e8f05be38df04`。
- 知识会话持久化与引用失效复核：`d83c433`。
- 正式知识资源生命周期、审核、权限/D4 过滤、Office 解析：`3a8c422`。
- 正式依据问答与 citations：`8856376`。
- 写作模型网关和已确认的直接输出规则：`15ac187`、`c0937c3`。
- 两个本地备份：`SanjiangAI20260827.7z`、`SanjiangAI202608270900.7z`，均为 `LOCAL BACKUP / DO NOT READ / DO NOT COMMIT`。

## 8. Verification Record

| Command | Result | Notes |
|---|---|---|
| `node --version` / `npm --version` | PASS | Node `v24.15.0`、npm `11.12.1`，满足 `package.json` 的 Node 最低版本。 |
| `npm run dev` | PASS | Vite 在约 3.8 秒启动，提供 `http://localhost:5173/`；未发送业务/API 请求，随后已停止。 |
| `npx wrangler d1 migrations list DB --local --config wrangler.local.toml` | PASS | 明确显示 `Resource location: local`，无待执行 migration。 |
| `npx wrangler d1 execute ... SELECT name FROM d1_migrations` | PASS | 确认 `0000` 至 `0009` 均已应用，仅操作 local D1。 |
| `npm run lint` | PASS | 已直接执行本地 ESLint；规则和忽略范围未改变，不再依赖 Bash。 |
| `npm run build` | BLOCKED | 未执行；脚本已确认依赖同一 Bash 路径和 GNU `timeout`。 |
| `npm test` | BLOCKED | 未执行；它先调用被阻断的 `npm run build`。 |
| `npm run verify:local:test-access` | PASS | 虚构账号的角色、部门、数据级别与 ACL 边界通过。 |
| `npm run verify:local:model-gateway` | PASS | mock 模型、引用约束、超时、500、无依据与机密隔离通过。 |
| `npm run verify:formal-knowledge-lifecycle` | PASS | 虚构正式资料审核、门槛、归档和删除规则通过。 |
| `npm run verify:knowledge-resource-parsing` | PASS | 虚构 XLS/XLSX/PPTX 定位解析、旧 PPT 待转换和伪造 XLSX 拒绝通过。 |
| `npm run verify:knowledge-grounded-chat` | PASS | 正式依据过滤、无依据拒答、失败保护和受限预览通过。 |
| `npm run verify:knowledge-conversations` | PASS | 会话持久化、归属权限、历史失效保护通过。 |
| `npm run verify:writing-model-gateway` | PASS | mock OpenAI-compatible 写作调用、受限输入和失败保护通过。 |
| `npm run verify:writing-structured` | PASS | 三种虚构文种、DOCX 编号和表格 XML 验证通过。 |
| 真实 OA / 真实模型 / 真实集团资料 | EXTERNAL / FUTURE DEPLOYMENT | 本轮未连接、未调用、未使用。 |

## 9. Audit Conclusion

**`PHASE 0 READY FOR SMALL FIXES`**

当前 Cloudflare 本地开发基线能够启动并运行已验收业务，D1/R2 local state 和离线验证链存在。下一步应先补最小、独立且不触及业务逻辑的 Windows 工具链或可观测性缺口，而不是提前迁移 PostgreSQL、Redis、OpenSearch、Qdrant 或对象存储。
