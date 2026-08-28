# 三江集团试运行准备与验收清单

> 当前基线：`local-development` / `9a0ef096013e0cdeccda0bf454a638a614c92dcc`
> 目的：区分已经具备代码与虚构验证支撑的能力，和真实试运行前必须由模型、集团数据、OA 或部署环境提供的前置条件。
> 边界：本清单不表示可以导入真实集团资料，也不表示已经完成真实模型或 OA 联调。

## 1. 已完成

以下能力已进入当前 Git 历史，且有代码与离线/本机虚构验证支撑：

| 能力 | 当前状态 | 代码与测试证据 |
| --- | --- | --- |
| RAG | COMPLETE | 授权范围前置、关键词与向量召回、RRF、重排、Top Evidence、无依据拒答和 citations；`verify:full-rag-grounded-answer`、`verify:permission-scoped-vector-retrieval`、`verify:hybrid-knowledge-retrieval`、`verify:reranked-knowledge-evidence`。 |
| WritingV2 + RAG | COMPLETE / WAITING REAL MODEL ACCEPTANCE | 已授权正式证据只注入写作上下文，私有参考材料隔离，结构化或连续正文可导出 Word；`verify:writing-rag-integration`、`verify:writing-model-gateway`、`verify:writing-structured`。 |
| AI Archive | COMPLETE | 写作成果以 `NON_FORMAL` artifact 保存，不进入公共 documents、检索或 RAG；`verify:ai-archive-formal-artifact-lifecycle`。 |
| Formal Return | COMPLETE | 仅系统管理员可受控正式化；正式化后仍须走 pending review、批准、生效、索引和 RAG 生命周期；`verify:ai-archive-management`、`verify:ai-archive-formal-artifact-lifecycle`。 |
| Policy Candidate Lifecycle | COMPLETE | 政策来源、候选幂等、人工候选审核、正式资料待审核关联、旧版本失效与 RAG 门槛；`verify:policy-candidate-lifecycle`。 |
| OA Connector Foundation | COMPLETE / WAITING REAL OA API | 管理员配置、凭证服务端加密保存、只读连接检测、认证状态分类；同步和导入明确未实现；`verify:oa-connector-foundation`。 |
| request_id / structured logging / health | COMPLETE | `/api/*` 透传或生成 `x-request-id`；关键写作、知识问答和 OA 审计可关联；`/api/health` 区分服务、D1、绑定和模型配置；`verify:runtime-observability`。 |

## 2. WAITING REAL MODEL

以下是进入真实试运行前的模型联调条件，不是当前代码未完成项：

- [ ] Qwen 主模型真实部署，并通过受控 OpenAI-compatible 网关联调。
- [ ] Qwen3-Embedding-4B 真实部署、模型路由和向量生成联调。
- [ ] Qwen3-Reranker-4B 真实部署、重排服务联调。
- [ ] 真实模型 endpoint 与服务端 credentials 由部署平台安全配置，且不进入 Git、浏览器或普通日志。
- [ ] 使用真实授权资料与典型问题完成 30 题 RAG 重新验收。

## 3. WAITING GROUP DATA

以下是集团在授权、脱敏和责任人确认后提供的试运行输入，不是当前代码未完成项：

- [ ] 已授权、可用于试运行的集团正式资料。
- [ ] 真实 ACL、D1-D4 分级和适用范围确认。
- [ ] 真实典型问题集及其预期依据范围。
- [ ] 经授权的真实公文写作样例，仅作为格式与人工验收参考。
- [ ] 经授权的真实政策样本，用于政策候选与正式资料流程验收。
- [ ] 用户、部门、角色和管理员账号初始化，并完成责任人确认。

## 4. WAITING EXTERNAL

以下依赖由 OA 厂商、网络与部署环境提供，不是当前代码未完成项：

- [ ] OA 实际接口文档，包括清单、详情、下载、字段映射和只读限制。
- [ ] OA 实际认证方式，包括 Token、签名、OAuth 或其他厂商协议说明。
- [ ] OA 测试账号、隔离测试环境和最小权限范围。
- [ ] 网络、DNS、TLS、出口白名单和证书链条件。
- [ ] 服务器、GPU、对象存储、备份和恢复的部署条件。

## TRIAL ENTRY GATE

只有以下项目全部满足，才可以进入真实试运行：

- [ ] 真实模型联调 PASS。
- [ ] 真实集团资料导入 PASS。
- [ ] 权限验收 PASS。
- [ ] 真实 30 题 RAG 验收 PASS。
- [ ] WritingV2 真实模型验收 PASS。
- [ ] health/readiness PASS。
- [ ] 备份/恢复方案确认。
- [ ] 管理员账号与权限确认。

## 使用说明

- 在所有 Entry Gate 勾选完成前，继续只使用虚构或经确认脱敏的测试资料。
- OA 连接测试成功不等于可以同步、导入或作为 RAG 依据；真实 OA 对接必须在接口文档与测试环境到位后单独验收。
- 模型 endpoint、密码、Token、Secret、真实资料正文和 D4 内容不得写入本清单、Git、普通日志或前端配置。
