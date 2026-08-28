# 三江集团项目代码真实状态盘点

> 盘点日期：2026-08-28  
> 盘点基线：`local-development` / `d83c433dc308e88d2d180b3b1e50bd85c9ff00ab`  
> 盘点原则：本文件只以当前代码、离线验证和当前分支 Git 历史为证据。计划书中的目标、页面展示文字和旧开发日志不等同于已实现能力。

## 状态说明

- `COMPLETE`：代码存在、已有离线或本机验证、行为符合当前 V3.0 已确认规则，并已进入当前 Git 历史。
- `PARTIAL`：已有部分代码或验证，但缺少计划要求中的关键能力、统一闭环或运行时验证。
- `CODE COMPLETE / NOT VERIFIED`：代码和当前分支提交存在，但未发现对应的可重复验证。
- `NOT FOUND`：未找到代码、配置、API、迁移或验证证据。
- `BLOCKED`：当前仓库条件不足，不能安全确认。
- `EXTERNAL CONDITION`：需要部署环境、受控服务或后续外部系统后才能验证；本轮不连接外部服务。

## 第 0 关：工程底座

**总体状态：`PARTIAL`**

| 模块 | 计划要求 | 当前状态 | 代码证据 | 测试证据 | Git commit | 缺失项 | 下一阶段 |
|---|---|---|---|---|---|---|---|
| Node/npm | Node 项目、npm 脚本 | COMPLETE | `package.json` 指定 Node `>=22.13.0`，包含开发、迁移、种子和 verify 脚本 | `npm run` 已列出 18 个可用脚本 | `c2aa61d` 及后续 | 无 | 按 Windows 文档执行本机开发 |
| 本机启动方式 | Vite/Vinext 本机服务 | COMPLETE | `package.json` 的 `dev: vite`，`start: vinext start` | 启动方式已有人工验收记录；本轮未启动服务 | `c2aa61d` | 无 | 仅在人工验收关启动 |
| API/后端 | 服务端 API 路由 | COMPLETE | `app/api/**/route.ts`，含资料、知识会话、写作、审核等 API | 各模块 verify 脚本通过 | `27d47bc` 至 `d83c433` | 无 | 按模块继续扩展 |
| Worker | Cloudflare Worker 入口与 D1 binding | COMPLETE | `worker/index.ts`、`types/runtime-env.d.ts` | Worker 类型与本机路径已被现有开发流程使用 | `c2aa61d`、`c0937c3` | 无 | 维持服务端绑定读取 |
| PostgreSQL | PostgreSQL 数据库 | NOT FOUND | 未发现驱动、配置或 migration | 未发现 | — | 当前实现使用 D1/SQLite | 如后续架构批准再评估 |
| D1 migration | 本机 D1 migration | COMPLETE | `drizzle/0000` 至 `0009`，`db/schema.ts`，`db:migrate:local` | 生命周期、会话相关验证已通过；此前人工关已确认 local D1 的 0008/0009 | `3a8c422`、`d83c433` | 远程/生产迁移不在本盘点范围 | 继续仅按迁移关执行 |
| Redis | 缓存/队列 | NOT FOUND | 未发现依赖、连接或配置 | 未发现 | — | 无 Redis | 后续性能关评估 |
| Object storage | R2 原文件存储与回滚 | COMPLETE | `app/api/documents/upload/route.ts`、`app/api/writing/[id]/private-references/route.ts` | 私有材料和知识资源验证已覆盖 R2 回滚/清理规则 | `9c41cd9`、`3a8c422` | 本机 R2 模拟依赖开发环境 | 生产绑定另行验收 |
| OpenSearch | 专用全文搜索 | NOT FOUND | 未发现客户端、索引或配置 | 未发现 | — | 当前为 D1 分段关键词评分 | 后续检索基础设施关 |
| Qdrant | 向量数据库 | NOT FOUND | 未发现客户端、collection 或配置 | 未发现 | — | 无向量检索 | 后续向量检索关 |
| `.env.example` | 安全服务端变量示例 | PARTIAL | `.env.example` 含写作 `AI_*`、OA 占位变量，默认 `AI_MODEL_ENABLED=false` | 代码验证写作运行时变量读取 | `15ac187`、`3a8c422` | 未列出知识问答 `MODEL_GATEWAY_*` 示例 | 文档修订关补齐示例 |
| health endpoint | 服务健康检查 | NOT FOUND | `app/api/models/status/route.ts` 仅报告脱敏配置，不探测服务连通性 | 未发现 | `2f3ee13` | 无 `/health` 或模型探测 | 专项运维关 |
| logging / request_id | 请求日志和关联 ID | PARTIAL | `audit_logs` 与各关键 API 审计；未找到统一 request ID 中间件 | 模型写作、审核等有最小审计验证 | `9c41cd9`、`15ac187`、`3a8c422` | 无统一 request_id、结构化服务日志 | 运维可观测性关 |
| audit 基础 | 关键操作审计 | COMPLETE | `db/schema.ts` 的 `auditLogs`，上传、审核、写作、会话 API 均写最小审计 | 生命周期与写作验证通过 | `d72984a` 及后续 | 非统一模型网关审计 | 运维可观测性关 |
| 本地开发文档 | Windows 本机说明 | PARTIAL | `docs/WINDOWS_LOCAL_DEVELOPMENT.md` | 文档含启动、D1、虚构夹具和验证说明 | `c2aa61d`、`15ac187` | 存在模型行为过期描述，见 Documentation Drift | 文档修订关 |
| verify scripts | 可重复离线验证 | COMPLETE | `scripts/verify-*.ts` 与 `package.json` | 本轮五个指定离线验证均通过 | `b071ae5` 至 `d83c433` | 不替代部署环境验收 | 每关继续添加对应验证 |

## 第 1 关：账号、权限与上传安全

**总体状态：`PARTIAL`**

| 模块 | 计划要求 | 当前状态 | 代码证据 | 测试证据 | Git commit | 缺失项 | 下一阶段 |
|---|---|---|---|---|---|---|---|
| user / current user context | 当前登录用户与服务端身份 | COMPLETE | `lib/access.ts`、`app/api/local-test/accounts/route.ts`、各 API 的 `requireAccessUser` | `verify:local:test-access` | `dd26153`、`b071ae5` | 真实企业 SSO 不在当前仓库范围 | 后续身份集成关 |
| organization / department | 组织与部门归属 | PARTIAL | `users.departmentName`、资料 `ownerDepartment` | 本机测试账号覆盖部门访问 | `dd26153` | 未发现独立 organization 表和组织树 | 组织治理关 |
| role / RBAC | system_admin 等角色 | COMPLETE | `lib/access.ts`、`lib/document-access.ts`、审核/上传 API | 生命周期验证覆盖管理员与普通员工限制 | `dd26153`、`3a8c422` | 无细粒度角色管理 UI 审计 | 权限治理关 |
| permission group | 权限组 | PARTIAL | 账号包含试用管理相关属性 | 本机测试身份覆盖基础角色 | `dd26153` | 未发现独立 permission group 数据模型 | 权限治理关 |
| ABAC | 部门、级别、密级、范围判断 | COMPLETE | `lib/document-access.ts` 的部门、clearance、scope 规则 | `verify:local:test-access` 覆盖员工、负责人、管理员差异 | `dd26153`、`b071ae5` | 规则配置化不足 | 权限治理关 |
| explicit ACL | 按用户/部门资料授权 | COMPLETE | `document_acl`、`canReadDocument` | 生命周期、引用预览、会话验证均依赖 ACL | `dd26153`、`3a8c422` | 无批量授权流程盘点 | 权限治理关 |
| allow / deny / deny override | 显式授权与拒绝优先级 | PARTIAL | ACL 有 `canRead` 等允许字段，密级/范围可拒绝 | 访问测试覆盖若干拒绝场景 | `dd26153`、`b071ae5` | 未发现通用 deny 规则或明确 deny-overrides 实现 | 权限治理关 |
| D1-D4 | 数据分级 | PARTIAL | D4 在 RAG、引用预览和模型外发前被排除；页面显示 D1-D4 规划 | 生命周期/问答验证覆盖 D4 排除 | `3a8c422`、`8856376` | D1-D3 未见统一、完整的强制策略矩阵 | 数据分级关 |
| blocked terms | 禁止词条 | COMPLETE | `blocked_terms`、`lib/upload-control.ts`、`app/api/blocked-terms/*` | 本机上传与私有材料验证覆盖命中不写入 | `8596997`、`9c41cd9` | 无 | 维持后台管理 |
| confidential blocking | 机密上传阻断 | COMPLETE | documents/private references 上传 API 先拒绝 `confidential` / `机密` | 本机上传、私有材料验证覆盖 | `9c41cd9` | 机密专用流程未实现 | 后续机密资料专项 |
| upload safety | 解析、禁止词、存储回滚 | COMPLETE | `documents/upload`、`writing/private-references`、`lib/ingestion.ts` | 上传、解析、私有材料验证通过 | `9c41cd9`、`3a8c422` | 不含恶意文件沙箱/杀毒服务 | 安全加固关 |
| 权限发生在 retrieval 前 | 检索前过滤，无权片段不入模型 | COMPLETE | `lib/rag.ts` 先查正式状态，再用 `canReadDocument` 过滤，之后才组装 citations/模型上下文 | `verify:knowledge-grounded-chat`、`verify:knowledge-conversations` | `3a8c422`、`8856376`、`d83c433` | 无 | 保持同一过滤器复用 |

## 第 2 关：正式知识入库

**总体状态：`PARTIAL`**

| 模块 | 计划要求 | 当前状态 | 代码证据 | 测试证据 | Git commit | 缺失项 | 下一阶段 |
|---|---|---|---|---|---|---|---|
| Upload / quarantine safety | 管理员上传前安全检查 | COMPLETE | `app/api/documents/upload/route.ts`、`lib/upload-control.ts` | 生命周期、解析验证通过 | `3a8c422` | 无独立隔离区服务 | 安全加固关 |
| storage | 私有 R2 保存与 D1 失败回滚 | COMPLETE | `documents/upload` 先写对象、失败仅回滚本次 key | 生命周期人工/自动验收记录 | `3a8c422` | 真实生产 R2 验收属于外部环境 | 部署验收 |
| metadata | 标题、类别、来源、日期、适用范围、评分 | COMPLETE | `db/schema.ts`、审核 API、知识资源页面 | `verify:formal-knowledge-lifecycle` | `3a8c422` | 无 | 持续人工审核 |
| lifecycle | draft/parsing/pending_review/approved/rejected/archived | COMPLETE | `drizzle/0008_formal_knowledge_lifecycle.sql`、`documents/[id]/approve`、`lifecycle` | `verify:formal-knowledge-lifecycle` | `3a8c422` | 无 | 保持状态门槛 |
| version / current version | 新版本重新审核、当前版本过滤 | COMPLETE | `document_versions`、`documents/[id]/versions`、`lib/rag.ts` | 生命周期与会话验证覆盖 current approved version | `3a8c422`、`d83c433` | 无 | 保持复核 |
| chunk / full-text index | 文本分段与关键词索引 | COMPLETE | `lib/ingestion.ts`、`document_chunks`、`lib/rag.ts` | 生命周期、问答与解析验证通过 | `85bb915`、`3a8c422` | 无专用搜索引擎 | 检索升级关 |
| vector / embedding index | 向量化索引 | NOT FOUND | 未发现 embedding 调用、向量字段或外部向量库 | 未发现 | — | 当前不是语义向量检索 | Embedding/Reranker 专项关 |
| preview | 授权片段预览 | COMPLETE | `app/api/knowledge/citations/[documentId]/route.ts` | `verify:knowledge-grounded-chat` | `8856376` | 无文件全文下载 | 保持最小预览 |
| delete / archive / revoke cleanup | 立即退出检索并清理关联记录 | COMPLETE | `documents/[id]/lifecycle` 先标记不可检索，再清理 D1/R2/ACL | 生命周期验证通过 | `3a8c422` | R2 清理失败需要人工核查 | 运维流程关 |
| DOC/DOCX | 上传与解析 | PARTIAL | DOCX 解析；旧 DOC 为待转换，不伪造正文 | 私有材料验证覆盖 DOC 待转换 | `9c41cd9`、`3a8c422` | DOC 无可靠服务端转换 | Office 转换关 |
| PDF | 上传与解析 | PARTIAL | PDF 允许安全保存；解析器返回 `pending_ocr` | 解析规则存在 | `3a8c422` | PDF OCR/文本解析未实现 | PDF OCR 专项关 |
| TXT / MD | 上传与解析 | COMPLETE | `lib/ingestion.ts`、上传白名单 | 上传验证覆盖文本 | `9c41cd9`、`3a8c422` | 无 | 无 |
| XLS / XLSX | 表格解析与定位 | COMPLETE | `lib/writing-reference-parser.ts`、共享解析链路 | `verify:knowledge-resource-parsing` 通过，含单元格定位 | `3a8c422` | 无 | 无 |
| PPTX | 幻灯片解析与定位 | COMPLETE | `lib/writing-reference-parser.ts` | 解析验证通过，含页码定位 | `3a8c422` | 无 | 无 |
| PPT | 保存但待转换解析 | PARTIAL | 允许上传，标记 `pending_conversion` | 解析验证确认待转换且不可引用 | `3a8c422` | 无服务端转换 | 旧 PPT 转换专项关 |
| 图片 / 扫描件 | 图像解析 | NOT FOUND | 未发现图片上传解析或 OCR 调用 | 未发现 | — | 无图片/扫描件入库链路 | OCR 专项关 |
| OCR | PDF/扫描件 OCR | NOT FOUND | 页面/API 状态明确写“下一阶段接入” | 未发现 | — | 未实现 | OCR 专项关 |
| reliability / D4 | 正式依据门槛 | COMPLETE | 评分不少于 60、非 D4、approved/effective/current/parsed/ready 才进入 RAG | 生命周期、问答、会话验证通过 | `3a8c422`、`8856376`、`d83c433` | 无 | 无 |

## 第 3 关：搜索、RAG 与知识会话

**总体状态：`PARTIAL`**

| 模块 | 计划要求 | 当前状态 | 代码证据 | 测试证据 | Git commit | 缺失项 | 下一阶段 |
|---|---|---|---|---|---|---|---|
| keyword search | 授权资料关键词检索 | COMPLETE | `lib/rag.ts`、`app/api/knowledge/search/route.ts` | 会话/问答验证通过 | `85bb915`、`d83c433` | 排序为简单相关度，不是专业搜索引擎 | 检索升级关 |
| semantic / vector search | 向量语义检索 | NOT FOUND | 未发现 embedding 或向量库 | 未发现 | — | 无 | Embedding 专项关 |
| hybrid / fusion / RRF | 关键词与向量融合 | NOT FOUND | 未发现 hybrid、fusion、RRF | 未发现 | — | 无 | 检索升级关 |
| permission / version filter | 检索前正式资料过滤 | COMPLETE | `lib/rag.ts` 过滤 approved/effective/current/parsed/ready/reliability/D4 后再 ACL | `verify:knowledge-grounded-chat`、`verify:knowledge-conversations` | `3a8c422`、`8856376`、`d83c433` | 无 | 无 |
| evidence selection | 将授权分段组成 citations | COMPLETE | `lib/rag.ts`、`app/api/knowledge/ask` | grounded chat 验证通过 | `8856376` | 关键词选择质量待后续检索升级 | 检索升级关 |
| context assembling | 当前问题、有效历史、授权片段入模型 | COMPLETE | `lib/knowledge-conversations.ts`、`lib/model-gateway.ts` | `verify:knowledge-conversations` mock 网关断言通过 | `d83c433` | 无 | 无 |
| no-evidence refusal | 无资料不编造 | COMPLETE | `resolveGroundedAnswer`、知识问答 API | grounded chat 验证通过 | `2f3ee13`、`8856376` | 无 | 无 |
| citations | 标题、版本、位置、短预览 | COMPLETE | `lib/rag.ts`、`knowledge/citations/[documentId]` | grounded chat 验证通过 | `8856376` | 页码仅在格式解析能提供时具备；当前通用 RAG 用段落定位 | 解析增强关 |
| citation snapshot | 会话引用最小快照 | COMPLETE | `knowledge_message_citations`、`lib/knowledge-conversations.ts` | 会话验证通过 | `d83c433` | 无 | 无 |
| history invalidation | 归档/删除/失权后历史回答不可见 | COMPLETE | `lib/knowledge-conversations.ts` 实时复核引用 | 会话验证通过 | `d83c433` | 无 | 无 |
| session / messages persistence | 会话、消息、软删除 | COMPLETE | `drizzle/0009_knowledge_conversations.sql`、`knowledge/conversations/*` | 会话验证通过 | `d83c433` | 无 | 无 |
| admin conversation audit | 管理员最小元数据审计 | PARTIAL | 会话服务含管理员读取权限，页面审计能力有限 | 会话验证覆盖权限边界 | `d83c433` | 未见独立管理员会话审计页面 | 会话治理关 |

## Model Gateway

**总体状态：`PARTIAL`**

| 模块 | 计划要求 | 当前状态 | 代码证据 | 测试证据 | Git commit | 缺失项 | 下一阶段 |
|---|---|---|---|---|---|---|---|
| OpenAI-compatible / chat completions | 可替换聊天网关 | COMPLETE | `lib/model-gateway.ts`、`lib/writing-model-gateway.ts` 调用 `/chat/completions` | `verify:local:model-gateway`、`verify:writing-model-gateway`；本轮后者通过 | `2f3ee13`、`15ac187`、`c0937c3` | 无 | 无 |
| knowledge gateway | 正式依据问答模型调用 | COMPLETE | `lib/model-gateway.ts`、`lib/rag.ts`、`knowledge/ask` | 会话验证 mock 调用通过 | `2f3ee13`、`d83c433` | 知识问答环境变量示例缺失 | 文档修订关 |
| writing gateway | 写作模型调用 | COMPLETE | `lib/writing-model-gateway.ts`、`writing/route` | `verify:writing-model-gateway` 通过 | `15ac187`、`c0937c3` | 无 | 无 |
| timeout | 请求超时 | COMPLETE | 两网关均用 `AbortController` | 两个网关 verify 覆盖超时 | `2f3ee13`、`15ac187` | 无 retry | 运维增强关 |
| sensitive blocking | D4/机密等外发阻断 | COMPLETE | RAG 排除 D4；写作网关受限输入检查 | 写作模型验证覆盖 | `3a8c422`、`c0937c3` | 规则不是统一服务 | 安全治理关 |
| permission filtering | 外发前权限过滤 | COMPLETE | `lib/rag.ts`、`canReadDocument` | grounded chat / conversations 验证通过 | `3a8c422`、`d83c433` | 无 | 无 |
| fallback | 网关失败处理 | PARTIAL | 知识问答降级为授权原文摘录；写作失败不生成正文 | `verify:local:model-gateway`、`verify:writing-model-gateway` | `2f3ee13`、`c0937c3` | 无统一 fallback 策略 | 产品规则确认后专项 |
| audit | 模型调用最小审计 | PARTIAL | 写作 API 写最小审计；知识问答无统一网关审计模块 | 写作验证覆盖安全边界 | `15ac187`、`c0937c3` | 知识问答模型调用审计不完整 | 运维可观测性关 |
| retry | 可控重试 | NOT FOUND | 未找到 retry 实现 | 未发现 | — | 无 | 运维增强关 |
| health check | 模型真实连通性检查 | NOT FOUND | models/status 仅报告配置，不发网络探测 | 未发现 | `2f3ee13` | 无 | 运维增强关 |
| main-chat alias | 逻辑别名 | NOT FOUND | 未找到 `main-chat` 或等价 alias | 未发现 | — | 无 | 模型路由专项关 |
| embedding / reranker alias | 逻辑别名 | NOT FOUND | 未找到 alias 配置 | 未发现 | — | 无 | 模型路由专项关 |
| embeddings API | `/v1/embeddings` 调用 | NOT FOUND | 未找到 | 未发现 | — | 无 | Embedding 专项关 |
| rerank API | `/v1/rerank` 调用 | NOT FOUND | 未找到 | 未发现 | — | 无 | Reranker 专项关 |

## WritingV2：冻结基线

**状态：`COMPLETE` / `FROZEN BASELINE`**  
**基线提交：`3bafa75089273fb7d9023f4f831e8f05be38df04`**

| 模块 | 计划要求 | 当前状态 | 代码证据 | 测试证据 | Git commit | 缺失项 | 下一阶段 |
|---|---|---|---|---|---|---|---|
| 两阶段交互 | 第一阶段填写，点击后才进入正文 | COMPLETE | `app/page.tsx` 的 `WritingV2`、`app/api/writing/route.ts` | 写作人工验收记录、结构化验证 | `3bafa750`，后续 `c0937c3` | 无 | 未经新需求不得修改 |
| 首次进入 / 刷新 | 回到第一阶段，不恢复正文 | COMPLETE | `WritingV2` 初始状态不读取旧工作区正文 | 已完成人工页面验收 | `3bafa750` | 无 | 冻结 |
| 第二阶段隐藏项 | 提纲、正式依据、私有状态、历史版本、草稿/定稿操作不默认显示 | COMPLETE | `app/page.tsx` 当前 `WritingV2` | 已完成人工页面验收 | `3bafa750`、`c0937c3` | 无 | 冻结 |
| 最多 3 份 / 即时上传 | 选择后立即绑定工作区上传 | COMPLETE | `writing/route`、`writing/[id]/private-references` | `verify:local:writing`、人工验收 | `3bafa750`、`9c41cd9` | 无 | 冻结 |
| 私有存储 / 权限 | 专用 `writing-references/` 前缀、创建人/admin 访问 | COMPLETE | private references API、schema | `verify:local:writing` | `9c41cd9`、`3bafa750` | 无 | 冻结 |
| confidential / blocked | 机密拒绝、禁止词写入前阻断 | COMPLETE | private references API | `verify:local:writing` | `9c41cd9` | 无 | 冻结 |
| 删除失败回滚 | D1/R2 同步删除及保护 | COMPLETE | private references DELETE 路径 | `verify:local:writing` | `9c41cd9` | 无 | 冻结 |
| 内容级去重 | 不做内容哈希去重，仅文件名阻止重复 | COMPLETE | `app/page.tsx` 与已确认流程 | 已完成人工页面验收 | `3bafa750` | 不提供内容哈希去重，属确认的产品规则 | 冻结 |
| 正文自动保存 | 不自动保存；导出时保存当前正文 | COMPLETE | 写作 API 与页面导出流程 | 已完成人工页面验收 | `3bafa750` | 不做防抖自动保存，属确认的产品规则 | 冻结 |
| Word 导出 | 可随时多次导出，支持结构化与连续正文 | COMPLETE | `lib/docx-export.ts`、`writing/[id]/export` | `verify:writing-structured`、`verify:local:writing-export` | `3bafa750`、`c0937c3` | 无 | 未经专项需求不得修改 |

## Documentation Drift

- Model Gateway 实际已进入当前正式提交历史：知识问答网关在 `2f3ee13`，写作网关在 `15ac187`，本地 Qwen 输出修订在 `c0937c3`，会话上下文复用在 `d83c433`。旧开发日志如称“已开发但尚未提交”已经过期。
- `main-chat` alias、embedding alias、reranker alias、`/v1/embeddings`、`/v1/rerank`、真实健康检查和 retry 均未实现；页面上出现的 Embedding、Reranker、OCR 名称属于规划或展示，不能标为已完成。
- `docs/WINDOWS_LOCAL_DEVELOPMENT.md` 仍称智能写作“默认使用本地模拟结构化生成器”和失败“回退模拟生成”；当前 `c0937c3` 后代码规则为模型未启用/失败时不生成正文，属于过期说明。
- 同一文档说明知识问答使用 `MODEL_GATEWAY_*`，但 `.env.example` 只提供写作 `AI_*` 示例，知识问答配置示例缺失。
- 当前检索是 D1 分段关键词检索，不是向量检索、混合检索或 RRF。

## Protected / Ignored Local Files

| 文件 | 标记 | 处理规则 |
|---|---|---|
| `SanjiangAI20260827.7z` | LOCAL BACKUP / DO NOT READ / DO NOT COMMIT | 禁止读取、解压、修改、暂存、提交或删除。 |
| `SanjiangAI202608270900.7z` | LOCAL BACKUP / DO NOT READ / DO NOT COMMIT | 禁止读取、解压、修改、暂存、提交或删除。 |

## 本轮离线验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run` | PASS | 已确认当前可用脚本清单。 |
| `npm run verify:knowledge-conversations` | PASS | 虚构会话持久化、归属权限、历史失效与正式资料过滤。 |
| `npm run verify:knowledge-grounded-chat` | PASS | 虚构正式依据过滤、无依据提示、失败保护、受限预览。 |
| `npm run verify:formal-knowledge-lifecycle` | PASS | 虚构资料审核、检索门槛、归档与删除清理。 |
| `npm run verify:knowledge-resource-parsing` | PASS | 虚构 XLS/XLSX/PPTX 解析定位、旧 PPT 待转换、伪造 XLSX 拒绝。 |
| `npm run verify:writing-model-gateway` | PASS | mock OpenAI-compatible 写作请求、配置、敏感阻断、失败保护与直接输出规则。 |
| 真实 OA / 真实模型 / 真实集团资料验证 | EXTERNAL CONDITION | 本轮按要求未连接 OA、未调用真实模型、未使用真实资料。 |

## 当前盘点结论

- 已完成并可验证：本机工程底座、基础权限与上传安全、正式知识资料生命周期、关键词 RAG 的正式依据过滤、知识会话持久化、WritingV2 冻结基线、知识问答/写作聊天网关。
- 已部分实现：组织与权限组、D1-D4 完整策略、旧 DOC/PPT、PDF、模型 fallback、模型审计、本地开发文档。
- 未实现：PostgreSQL、Redis、OpenSearch、Qdrant、向量/Embedding/Reranker、OCR、图片扫描件、模型别名、模型健康检查和 retry。
- 当前不可用但不应在本轮补做：真实 OA 字段映射与同步、PDF OCR、旧 PPT 服务端转换、真实部署环境连通性验证。
