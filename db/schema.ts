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

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  operator: text("operator").notNull().default("项目管理员"), detail: text("detail").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_logs_created_at_idx").on(table.createdAt)]);
