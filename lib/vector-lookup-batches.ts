// 本文件提供 D1 向量查询的安全分批工具，避免大量已授权分段在 SQLite IN 查询中超过参数上限。

// D1/SQLite 在不同运行环境中的绑定参数上限不同。向量查询只使用保守的小批次，避免大量已授权分段触发 SQL 变量超限。
export const D1_VECTOR_LOOKUP_BATCH_SIZE = 80;

// 将已授权的 chunk ID 去重并拆成 D1 安全批次。输入仅来自权限前置后的范围，输出不改变任何授权边界或召回集合。
export function splitVectorLookupChunkIds(chunkIds: string[]) {
  const uniqueIds = [...new Set(chunkIds.filter(Boolean))];
  const batches: string[][] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += D1_VECTOR_LOOKUP_BATCH_SIZE) {
    batches.push(uniqueIds.slice(offset, offset + D1_VECTOR_LOOKUP_BATCH_SIZE));
  }
  return batches;
}
