-- 将历史“文件上传”资料统一迁移到自动批准规则；仅修复正常上传入口，绝不影响政策候选和正式稿回流的独立审核流程。
UPDATE documents
SET resource_status = 'approved',
    knowledge_status = 'approved',
    lifecycle_status = 'effective',
    reliability_score = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE source_type = '文件上传'
  AND (resource_status IN ('pending_review', 'pending', 'draft') OR knowledge_status IN ('pending', 'draft'));

-- 当前版本同步为已批准，保留既有版本号、正文、解析状态和引用追溯关系。
UPDATE document_versions
SET version_status = 'approved'
WHERE version_status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM documents
    WHERE documents.id = document_versions.document_id
      AND documents.source_type = '文件上传'
      AND documents.current_version = document_versions.version_no
  );

-- 审批记录改为系统自动批准，避免历史上传资料继续出现在人工审核队列。
UPDATE approvals
SET status = 'approved',
    reviewer = COALESCE(reviewer, submitted_by),
    reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
    comment = COALESCE(comment, '历史文件上传按自动批准规则迁移')
WHERE status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM documents
    JOIN document_versions ON document_versions.document_id = documents.id
    WHERE documents.id = approvals.document_id
      AND document_versions.id = approvals.version_id
      AND documents.source_type = '文件上传'
      AND documents.current_version = document_versions.version_no
  );
