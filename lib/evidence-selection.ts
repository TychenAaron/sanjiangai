// 本文件负责从已授权的 Hybrid 候选中选择可引用 Top Evidence；不读取数据库、不调用模型、不产生新候选。

export type EvidenceSelectionRuntime = Record<string, string | undefined>;

export const RERANK_EVIDENCE_DEFAULTS = {
  candidateLimit: 20,
  topK: 5,
} as const;

export type EvidenceSelectionConfig = {
  candidateLimit: number;
  topK: number;
};

export type SelectableEvidence = {
  documentId: string;
  versionId: string;
  chunkId: string;
  fusionScore: number;
  rerankScore?: number;
  rerankRank?: number;
};

function readPositiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

// 读取集中化候选与证据上限。运行时配置无效时安全采用受限默认值，避免路由散落 magic number。
export function readEvidenceSelectionConfig(runtime: EvidenceSelectionRuntime): EvidenceSelectionConfig {
  const candidateLimit = readPositiveInteger(runtime.RERANK_CANDIDATE_LIMIT, RERANK_EVIDENCE_DEFAULTS.candidateLimit, 50);
  const requestedTopK = readPositiveInteger(runtime.RERANK_TOP_K, RERANK_EVIDENCE_DEFAULTS.topK, candidateLimit);
  return { candidateLimit, topK: Math.min(requestedTopK, candidateLimit) };
}

// 按 rerank 或原 RRF 顺序截取 Top Evidence。输入候选本应已去重，此处再次按稳定主键保护 citation 不重复。
export function selectTopEvidence<T extends SelectableEvidence>(
  candidates: T[],
  options: { topK: number; rerankerUsed: boolean },
): T[] {
  if (!candidates.length || options.topK <= 0) return [];
  const unique = new Map<string, T>();
  for (const candidate of candidates) {
    const key = `${candidate.documentId}:${candidate.versionId}:${candidate.chunkId}`;
    const existing = unique.get(key);
    const candidateScore = options.rerankerUsed ? candidate.rerankScore ?? Number.NEGATIVE_INFINITY : candidate.fusionScore;
    const existingScore = existing ? (options.rerankerUsed ? existing.rerankScore ?? Number.NEGATIVE_INFINITY : existing.fusionScore) : Number.NEGATIVE_INFINITY;
    if (!existing || candidateScore > existingScore) unique.set(key, candidate);
  }
  return [...unique.values()]
    .sort((left, right) => {
      const leftScore = options.rerankerUsed ? left.rerankScore ?? Number.NEGATIVE_INFINITY : left.fusionScore;
      const rightScore = options.rerankerUsed ? right.rerankScore ?? Number.NEGATIVE_INFINITY : right.fusionScore;
      return rightScore - leftScore || left.documentId.localeCompare(right.documentId) || left.chunkId.localeCompare(right.chunkId);
    })
    .slice(0, options.topK);
}
