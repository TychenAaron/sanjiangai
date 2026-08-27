import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(), name: text("name").notNull(), parentId: text("parent_id"),
  status: text("status").notNull().default("active"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(), employeeNo: text("employee_no"),
  departmentId: text("department_id"), departmentName: text("department_name").notNull().default("集团办公室"),
  role: text("role").notNull().default("employee"), positionLevel: integer("position_level").notNull().default(1),
  clearanceLevel: integer("clearance_level").notNull().default(2), status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  documentType: text("document_type").notNull().default("其他资料"), sourceType: text("source_type").notNull(), sourceRef: text("source_ref"),
  ownerDepartment: text("owner_department").notNull().default("集团办公室"), securityLevel: text("security_level").notNull().default("内部"),
  permissionScope: text("permission_scope").notNull().default("集团本部"), lifecycleStatus: text("lifecycle_status").notNull().default("effective"),
  trialDataClass: text("trial_data_class").notNull().default("T2-内部脱敏测试"), isTrialData: integer("is_trial_data", { mode: "boolean" }).notNull().default(true),
  fileName: text("file_name"), storageKey: text("storage_key"), mimeType: text("mime_type"), fileSize: integer("file_size"),
  parseStatus: text("parse_status").notNull().default("parsed"), indexStatus: text("index_status").notNull().default("ready"),
  knowledgeStatus: text("knowledge_status").notNull().default("pending"), currentVersion: integer("current_version").notNull().default(1),
  createdBy: text("created_by").notNull().default("项目管理员"), createdByUserId: text("created_by_user_id"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("documents_updated_at_idx").on(table.updatedAt), index("documents_status_idx").on(table.knowledgeStatus), index("documents_source_idx").on(table.sourceType)]);

export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull(), versionNo: integer("version_no").notNull(),
  content: text("content").notNull(), changeSummary: text("change_summary").notNull().default("首次入库"),
  versionStatus: text("version_status").notNull().default("pending"), createdBy: text("created_by").notNull().default("项目管理员"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("document_version_unique").on(table.documentId, table.versionNo), index("document_versions_document_idx").on(table.documentId)]);

export const documentChunks = sqliteTable("document_chunks", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull(), versionId: text("version_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(), content: text("content").notNull(), charCount: integer("char_count").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("document_chunk_unique").on(table.versionId, table.chunkIndex),
  index("document_chunks_document_idx").on(table.documentId),
  index("document_chunks_version_idx").on(table.versionId),
]);

export const documentAcl = sqliteTable("document_acl", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull(), subjectType: text("subject_type").notNull(), subjectId: text("subject_id").notNull(),
  canRead: integer("can_read", { mode: "boolean" }).notNull().default(true), canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
  canReview: integer("can_review", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("document_acl_document_idx").on(table.documentId)]);

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(), documentId: text("document_id").notNull(), versionId: text("version_id").notNull(), status: text("status").notNull().default("pending"),
  submittedBy: text("submitted_by").notNull().default("项目管理员"), reviewer: text("reviewer"), comment: text("comment"),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`), reviewedAt: text("reviewed_at"),
}, (table) => [index("approvals_status_idx").on(table.status), index("approvals_document_idx").on(table.documentId)]);

export const policySources = sqliteTable("policy_sources", {
  id: text("id").primaryKey(), name: text("name").notNull(), agency: text("agency").notNull(), baseUrl: text("base_url").notNull(),
  checkInterval: text("check_interval").notNull().default("daily"), status: text("status").notNull().default("enabled"),
  lastCheckedAt: text("last_checked_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull(), title: text("title").notNull(), publishDate: text("publish_date"),
  originalUrl: text("original_url").notNull(), contentHash: text("content_hash"), reviewStatus: text("review_status").notNull().default("pending"),
  knowledgeDocumentId: text("knowledge_document_id"), discoveredAt: text("discovered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedBy: text("reviewed_by"), reviewedAt: text("reviewed_at"),
}, (table) => [uniqueIndex("policies_original_url_unique").on(table.originalUrl), index("policies_review_status_idx").on(table.reviewStatus)]);

export const syncJobs = sqliteTable("sync_jobs", {
  id: text("id").primaryKey(), sourceType: text("source_type").notNull(), sourceId: text("source_id"), status: text("status").notNull().default("queued"),
  foundCount: integer("found_count").notNull().default(0), importedCount: integer("imported_count").notNull().default(0), errorMessage: text("error_message"),
  startedAt: text("started_at"), finishedAt: text("finished_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const blockedTerms = sqliteTable("blocked_terms", {
  id: text("id").primaryKey(), term: text("term").notNull(), normalizedTerm: text("normalized_term").notNull(),
  category: text("category").notNull().default("自定义禁止项"), matchScope: text("match_scope").notNull().default("all"),
  note: text("note"), enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("blocked_terms_normalized_unique").on(table.normalizedTerm),
  index("blocked_terms_enabled_idx").on(table.enabled),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  operator: text("operator").notNull().default("项目管理员"), detail: text("detail").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_logs_created_at_idx").on(table.createdAt)]);

// 公文工作区仅保存待人工处理的写作材料，不会自动进入 documents 正式知识库。
export const writingDocuments = sqliteTable("writing_documents", {
  id: text("id").primaryKey(), documentType: text("document_type").notNull(), title: text("title").notNull(),
  submittingDepartment: text("submitting_department").notNull(), recipient: text("recipient").notNull(), facts: text("facts").notNull(),
  referenceQuery: text("reference_query").notNull(), referencesJson: text("references_json").notNull().default("[]"),
  status: text("status").notNull().default("outline"), createdByUserId: text("created_by_user_id").notNull(), createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("writing_documents_creator_idx").on(table.createdByUserId), index("writing_documents_updated_idx").on(table.updatedAt)]);

// 公文版本记录提纲、草稿、人工修改稿和最终定稿，读写目的仅为人工写作过程追溯。
export const writingVersions = sqliteTable("writing_versions", {
  id: text("id").primaryKey(), writingDocumentId: text("writing_document_id").notNull(), versionNo: integer("version_no").notNull(),
  stage: text("stage").notNull(), content: text("content").notNull(), checksJson: text("checks_json").notNull().default("[]"),
  // 结构化正文保存标题、段落、列表和真实表格数据；保留 content 以兼容已有纯文本版本。
  structuredContentJson: text("structured_content_json").notNull().default("{}"),
  createdByUserId: text("created_by_user_id").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("writing_versions_unique").on(table.writingDocumentId, table.versionNo), index("writing_versions_document_idx").on(table.writingDocumentId)]);

// 公文私有参考材料只服务于当前工作区，不进入 documents 正式知识库，也不参与公共检索。
export const writingPrivateReferences = sqliteTable("writing_private_references", {
  id: text("id").primaryKey(), writingDocumentId: text("writing_document_id").notNull(), fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"), fileSize: integer("file_size").notNull().default(0),
  // 私有原文件只允许使用 writing-references/ 前缀存入专用 R2，不复用公共 documents 的 storage_key。
  storageKey: text("storage_key").notNull(),
  parseFormat: text("parse_format").notNull(), parseStatus: text("parse_status").notNull(), parsedText: text("parsed_text").notNull().default(""),
  locationsJson: text("locations_json").notNull().default("[]"), parseReason: text("parse_reason"),
  createdByUserId: text("created_by_user_id").notNull(), createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("writing_private_references_document_idx").on(table.writingDocumentId),
  index("writing_private_references_creator_idx").on(table.createdByUserId),
]);
