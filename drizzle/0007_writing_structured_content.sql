-- 为既有公文版本追加结构化正文 JSON；只新增字段，不删除或改写现有 local D1 版本数据。
ALTER TABLE `writing_versions` ADD `structured_content_json` text NOT NULL DEFAULT '{}';
