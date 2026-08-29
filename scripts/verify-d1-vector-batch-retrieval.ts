// 本脚本使用完全虚构的 chunk ID 验证 D1 向量查询分批规则；不访问 D1、模型、OCR 或外部网络。
import assert from "node:assert/strict";
import { D1_VECTOR_LOOKUP_BATCH_SIZE, splitVectorLookupChunkIds } from "../lib/vector-lookup-batches.ts";

const ids = [
  ...Array.from({ length: 1_003 }, (_, index) => `virtual-chunk-${index}`),
  "virtual-chunk-0",
  "virtual-chunk-502",
];
const batches = splitVectorLookupChunkIds(ids);
const flattened = batches.flat();

assert.ok(batches.length > 1, "大集合必须拆成多个 D1 查询批次");
assert.ok(batches.every((batch) => batch.length > 0 && batch.length <= D1_VECTOR_LOOKUP_BATCH_SIZE), "每个查询批次必须低于 D1 安全参数上限");
assert.equal(new Set(flattened).size, 1_003, "分批前后必须完整保留且去重所有已授权 chunk ID");
assert.equal(flattened.length, 1_003, "重复 chunk ID 不得造成重复向量读取或改变排序输入");
assert.equal(flattened[0], "virtual-chunk-0");
assert.equal(flattened.at(-1), "virtual-chunk-1002");

console.log(`PASS D1 vector batch retrieval: ${flattened.length} virtual chunk IDs split into ${batches.length} batches of at most ${D1_VECTOR_LOOKUP_BATCH_SIZE}.`);
