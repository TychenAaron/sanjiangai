// 本文件提供纯 RRF 排名融合，不读取数据库、不调用模型；用于合并已完成权限过滤的关键词与向量 evidence。

export const HYBRID_RETRIEVAL_DEFAULTS = {
  keywordTopK: 10,
  vectorTopK: 10,
  fusionTopK: 8,
  rrfK: 60,
} as const;

export type HybridSource = "keyword" | "vector";

export type FusionEvidenceIdentity = {
  documentId: string;
  versionId: string;
  chunkId: string;
  score: number;
};

export type FusedEvidence<T extends FusionEvidenceIdentity> = T & {
  retrievalSources: HybridSource[];
  keywordRank?: number;
  vectorRank?: number;
  keywordScore?: number;
  vectorSimilarity?: number;
  fusionScore: number;
};

export type HybridFusionOptions = Partial<typeof HYBRID_RETRIEVAL_DEFAULTS>;

// 以排名而非原始分数执行 Reciprocal Rank Fusion。输入必须来自同一已授权 scope，输出保留两路来源、原始分数和可追溯主键。
export function fuseRankedEvidence<T extends FusionEvidenceIdentity>(
  keywordEvidence: T[],
  vectorEvidence: T[],
  options: HybridFusionOptions = {},
): FusedEvidence<T>[] {
  const rrfK = options.rrfK ?? HYBRID_RETRIEVAL_DEFAULTS.rrfK;
  const fusionTopK = options.fusionTopK ?? HYBRID_RETRIEVAL_DEFAULTS.fusionTopK;
  const candidates = new Map<string, FusedEvidence<T>>();

  const add = (source: HybridSource, evidence: T, rank: number) => {
    const key = `${evidence.documentId}:${evidence.versionId}:${evidence.chunkId}`;
    const existing = candidates.get(key);
    const score = 1 / (rrfK + rank);
    if (existing) {
      existing.fusionScore += score;
      if (!existing.retrievalSources.includes(source)) existing.retrievalSources.push(source);
      if (source === "keyword") { existing.keywordRank = rank; existing.keywordScore = evidence.score; }
      else { existing.vectorRank = rank; existing.vectorSimilarity = evidence.score; }
      return;
    }
    candidates.set(key, {
      ...evidence,
      retrievalSources: [source],
      ...(source === "keyword" ? { keywordRank: rank, keywordScore: evidence.score } : { vectorRank: rank, vectorSimilarity: evidence.score }),
      fusionScore: score,
    });
  };

  keywordEvidence.forEach((evidence, index) => add("keyword", evidence, index + 1));
  vectorEvidence.forEach((evidence, index) => add("vector", evidence, index + 1));
  return [...candidates.values()]
    .sort((left, right) => right.fusionScore - left.fusionScore || left.documentId.localeCompare(right.documentId) || left.chunkId.localeCompare(right.chunkId))
    .slice(0, fusionTopK);
}
