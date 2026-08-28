// 本文件定义第3关 RAG 离线验收集：全部内容为虚构、脱敏、可重复数据，不包含集团真实资料、账号或密钥。

export type RagEvalCategory = "keyword" | "semantic" | "hybrid" | "reranker" | "lifecycle" | "permission" | "refusal";

export type RagEvalCandidate = {
  documentId: string;
  versionId: string;
  chunkId: string;
  location: string;
  source: "keyword" | "vector" | "both";
  text: string;
  rerankScore: number;
};

export type RagEvalCase = {
  id: string;
  category: RagEvalCategory;
  question: string;
  user: { id: string; role: "employee" | "system_admin" };
  expectedDocumentIds: string[];
  expectedVersionIds: string[];
  expectedAnswerFacts: string[];
  forbiddenDocumentIds: string[];
  allowedDocuments: string[];
  deniedDocuments: string[];
  shouldRefuse: boolean;
  notes: string;
  candidates: RagEvalCandidate[];
};

function candidate(documentId: string, versionId: string, source: RagEvalCandidate["source"], text: string, rerankScore: number, index = 1): RagEvalCandidate {
  return { documentId, versionId, chunkId: `${documentId}-chunk-${index}`, location: `第${index}段`, source, text: `【${documentId}】${text}`, rerankScore };
}

function answerable(
  id: string,
  category: Exclude<RagEvalCategory, "refusal">,
  question: string,
  documentId: string,
  versionId: string,
  fact: string,
  source: RagEvalCandidate["source"],
  notes: string,
  extras: Partial<Pick<RagEvalCase, "forbiddenDocumentIds" | "deniedDocuments" | "candidates">> = {},
): RagEvalCase {
  const expected = candidate(documentId, versionId, source, fact, 0.95);
  return {
    id, category, question, user: { id: "virtual-employee-a", role: "employee" },
    expectedDocumentIds: [documentId], expectedVersionIds: [versionId], expectedAnswerFacts: [fact],
    forbiddenDocumentIds: extras.forbiddenDocumentIds || [], allowedDocuments: [documentId], deniedDocuments: extras.deniedDocuments || [],
    shouldRefuse: false, notes, candidates: extras.candidates || [expected],
  };
}

export const ragEvalCases: RagEvalCase[] = [
  // A. 精确关键词/条款题（6）
  answerable("KW-01", "keyword", "虚构采购管理制度的名称是什么？", "doc-procurement-rule", "v1", "虚构采购管理制度适用于本机测试采购流程。", "keyword", "制度名称精确命中"),
  answerable("KW-02", "keyword", "虚构文号 VIRT-2026-017 对应什么事项？", "doc-virt-017", "v1", "VIRT-2026-017明确虚构设备盘点安排。", "keyword", "文号精确命中"),
  answerable("KW-03", "keyword", "虚构费用规则中报销审批条款是什么？", "doc-expense-clause", "v2", "虚构费用报销需按授权层级完成审批。", "keyword", "明确条款命中"),
  answerable("KW-04", "keyword", "虚构项目预算超过50万元时需要什么？", "doc-budget-limit", "v1", "虚构项目预算超过50万元需提交专项复核。", "keyword", "金额条件命中"),
  answerable("KW-05", "keyword", "虚构通知要求在2026年6月30日前完成什么？", "doc-june-deadline", "v3", "虚构清单复核应在2026年6月30日前完成。", "keyword", "日期条件命中"),
  answerable("KW-06", "keyword", "虚构库存清点第八条规定了什么？", "doc-stock-article-8", "v1", "虚构库存清点第八条要求保留复核记录。", "keyword", "条款序号命中"),

  // B. 语义问法（5）
  answerable("SEM-01", "semantic", "物料数目对不上时由谁再次核验？", "doc-stock-recheck", "v2", "虚构库存差异由复核岗位再次核验。", "vector", "问题不复用原文的库存差异表述"),
  answerable("SEM-02", "semantic", "怎样确保提交材料没有遗漏？", "doc-submission-check", "v1", "虚构材料提交前应执行完整性检查。", "vector", "语义匹配完整性检查"),
  answerable("SEM-03", "semantic", "谁来统筹这项数据整理工作？", "doc-data-coordination", "v1", "虚构数据整理由协调岗位统筹。", "vector", "语义匹配统筹职责"),
  answerable("SEM-04", "semantic", "发现异常后应该走什么处理流程？", "doc-exception-process", "v2", "虚构异常发现后应登记并启动处置流程。", "vector", "语义匹配异常处置"),
  answerable("SEM-05", "semantic", "如何保存过程中的证明材料？", "doc-record-retention", "v1", "虚构过程证明材料应按目录留存。", "vector", "语义匹配留存要求"),

  // C. Hybrid 场景（4）
  answerable("HYB-01", "hybrid", "VIRT-盘点安排中谁负责复查库存差异？", "doc-hybrid-stock", "v1", "虚构盘点安排由复核岗位处理库存差异。", "both", "文号与职责语义共同召回"),
  answerable("HYB-02", "hybrid", "虚构预算门槛后的复核材料包括什么？", "doc-hybrid-budget", "v2", "虚构预算门槛复核需附本机测试清单。", "both", "金额关键词与材料语义共同召回"),
  answerable("HYB-03", "hybrid", "2026年虚构数据治理通知如何安排责任分工？", "doc-hybrid-governance", "v1", "虚构数据治理通知明确协调岗位和复核岗位分工。", "both", "日期关键词与职责语义共同召回"),
  answerable("HYB-04", "hybrid", "虚构第十二条怎样安排问题闭环？", "doc-hybrid-closure", "v3", "虚构第十二条要求登记、复核和闭环确认。", "both", "条款关键词与闭环语义共同召回"),

  // D. Reranker 场景（3）：正确资料不是融合第一名。
  answerable("RR-01", "reranker", "虚构盘点复核的最终责任是什么？", "doc-rerank-stock", "v2", "虚构盘点复核由指定责任岗位确认结果。", "both", "重排应提升责任确认资料", {
    candidates: [candidate("doc-rerank-decoy", "v1", "both", "虚构盘点的一般说明。", 0.30), candidate("doc-rerank-stock", "v2", "both", "虚构盘点复核由指定责任岗位确认结果。", 0.98)],
  }),
  answerable("RR-02", "reranker", "虚构报送材料缺项后如何处置？", "doc-rerank-submission", "v1", "虚构报送材料缺项时应退回补正并复核。", "both", "重排应提升缺项处置资料", {
    candidates: [candidate("doc-rerank-decoy-2", "v1", "both", "虚构报送的一般时间要求。", 0.21), candidate("doc-rerank-submission", "v1", "both", "虚构报送材料缺项时应退回补正并复核。", 0.97)],
  }),
  answerable("RR-03", "reranker", "虚构异常记录最终由谁关闭？", "doc-rerank-exception", "v3", "虚构异常记录由复核岗位完成关闭确认。", "both", "重排应提升关闭确认资料", {
    candidates: [candidate("doc-rerank-decoy-3", "v1", "both", "虚构异常的背景描述。", 0.25), candidate("doc-rerank-exception", "v3", "both", "虚构异常记录由复核岗位完成关闭确认。", 0.96)],
  }),

  // E. 版本与生命周期（4）
  answerable("LIFE-01", "lifecycle", "现行虚构盘点规则要求什么？", "doc-current-stock", "v3", "虚构现行盘点规则要求双人复核。", "keyword", "当前版本替代旧版本", { forbiddenDocumentIds: ["doc-current-stock-v2"], deniedDocuments: ["doc-current-stock-v2"] }),
  answerable("LIFE-02", "lifecycle", "已归档的虚构旧通知还能作为依据吗？", "doc-current-notice", "v2", "虚构现行通知要求使用当前版本。", "keyword", "归档资料不作为正式依据", { forbiddenDocumentIds: ["doc-archived-notice"], deniedDocuments: ["doc-archived-notice"] }),
  answerable("LIFE-03", "lifecycle", "被撤销的虚构流程应按哪份资料执行？", "doc-effective-flow", "v4", "虚构有效流程以v4版本为准。", "vector", "撤销资料被排除", { forbiddenDocumentIds: ["doc-revoked-flow"], deniedDocuments: ["doc-revoked-flow"] }),
  answerable("LIFE-04", "lifecycle", "虚构审批说明的最新要求是什么？", "doc-current-approval", "v5", "虚构最新审批说明要求记录复核结论。", "both", "旧版本不进入候选", { forbiddenDocumentIds: ["doc-old-approval"], deniedDocuments: ["doc-old-approval"] }),

  // F. 权限安全（5）
  answerable("PERM-01", "permission", "虚构部门A的盘点复核要求是什么？", "doc-dept-a-stock", "v1", "虚构部门A盘点复核需登记差异。", "keyword", "无权高相似资料被排除", { forbiddenDocumentIds: ["doc-dept-b-stock"], deniedDocuments: ["doc-dept-b-stock"] }),
  answerable("PERM-02", "permission", "虚构受限预算流程如何处理？", "doc-allowed-budget", "v2", "虚构允许预算流程要求专项复核。", "vector", "ACL 在向量前过滤", { forbiddenDocumentIds: ["doc-denied-budget"], deniedDocuments: ["doc-denied-budget"] }),
  answerable("PERM-03", "permission", "虚构密级数据应怎样整理？", "doc-allowed-data", "v1", "虚构允许数据应按目录整理。", "both", "D4 高相似资料被排除", { forbiddenDocumentIds: ["doc-d4-data"], deniedDocuments: ["doc-d4-data"] }),
  answerable("PERM-04", "permission", "虚构项目例外申请由谁复核？", "doc-allowed-exception", "v3", "虚构允许例外申请由复核岗位确认。", "keyword", "其他用户私有资料被排除", { forbiddenDocumentIds: ["doc-other-user-exception"], deniedDocuments: ["doc-other-user-exception"] }),
  answerable("PERM-05", "permission", "虚构资料保留周期的可见要求是什么？", "doc-allowed-retention", "v1", "虚构允许资料按规定周期留存。", "vector", "无权资料不进入模型上下文", { forbiddenDocumentIds: ["doc-denied-retention"], deniedDocuments: ["doc-denied-retention"] }),

  // G. 无依据拒答（3）
  { id: "REF-01", category: "refusal", question: "虚构不存在的云端审批费用是多少？", user: { id: "virtual-employee-a", role: "employee" }, expectedDocumentIds: [], expectedVersionIds: [], expectedAnswerFacts: [], forbiddenDocumentIds: [], allowedDocuments: [], deniedDocuments: [], shouldRefuse: true, notes: "知识库没有该费用资料", candidates: [] },
  { id: "REF-02", category: "refusal", question: "虚构不存在的外部合作结论是什么？", user: { id: "virtual-employee-a", role: "employee" }, expectedDocumentIds: [], expectedVersionIds: [], expectedAnswerFacts: [], forbiddenDocumentIds: [], allowedDocuments: [], deniedDocuments: [], shouldRefuse: true, notes: "知识库没有合作结论资料", candidates: [] },
  { id: "REF-03", category: "refusal", question: "虚构未来项目何时完成？", user: { id: "virtual-employee-a", role: "employee" }, expectedDocumentIds: [], expectedVersionIds: [], expectedAnswerFacts: [], forbiddenDocumentIds: [], allowedDocuments: [], deniedDocuments: [], shouldRefuse: true, notes: "知识库没有未来计划资料", candidates: [] },
];
