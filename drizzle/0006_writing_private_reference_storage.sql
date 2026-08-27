-- 为公文私有参考材料补充专用 R2 原文件存储键；迁移只会在 local D1 新增字段，不会删除或改写已有记录。
ALTER TABLE `writing_private_references` ADD `storage_key` text NOT NULL DEFAULT '';
