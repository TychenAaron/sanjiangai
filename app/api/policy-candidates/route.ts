// 政策候选列表和创建接口：候选仅供管理员管理，不能直接成为正式知识或 RAG 依据。
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { documentVersions, documents, policyCandidates } from "../../../db/schema";
import { accessError, requireAccessUser } from "../../../lib/access";
import { createPolicyCandidate } from "../../../lib/policy-candidates";
import { isFormalEvidenceDocument } from "../../../lib/rag";

export const runtime = "edge";

/**
 * 分页查询政策候选。
 * 输入为管理员身份和最小筛选条件；输出仅含候选及其关联正式资料的实时状态，RAG 可用性由正式生命周期计算。
 */
export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    if (user.role !== "system_admin") {
      return Response.json({ error: "仅管理员可管理政策候选" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
    const filters = [
      url.searchParams.get("status") ? eq(policyCandidates.status, url.searchParams.get("status")!) : undefined,
      url.searchParams.get("source") ? eq(policyCandidates.policySourceId, url.searchParams.get("source")!) : undefined,
      url.searchParams.get("documentNumber") ? eq(policyCandidates.documentNumber, url.searchParams.get("documentNumber")!) : undefined,
    ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
    const db = getDb();
    const candidates = await db
      .select()
      .from(policyCandidates)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(policyCandidates.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const documentIds = candidates.flatMap((candidate) => candidate.knowledgeDocumentId ? [candidate.knowledgeDocumentId] : []);
    const versionIds = candidates.flatMap((candidate) => candidate.knowledgeVersionId ? [candidate.knowledgeVersionId] : []);
    const [formalDocuments, formalVersions] = await Promise.all([
      documentIds.length ? db.select().from(documents).where(inArray(documents.id, documentIds)) : Promise.resolve([]),
      versionIds.length ? db.select().from(documentVersions).where(inArray(documentVersions.id, versionIds)) : Promise.resolve([]),
    ]);
    const documentsById = new Map(formalDocuments.map((document) => [document.id, document]));
    const versionsById = new Map(formalVersions.map((version) => [version.id, version]));

    return Response.json({
      page,
      pageSize,
      candidates: candidates.map((candidate) => {
        const document = candidate.knowledgeDocumentId ? documentsById.get(candidate.knowledgeDocumentId) : undefined;
        const version = candidate.knowledgeVersionId ? versionsById.get(candidate.knowledgeVersionId) : undefined;
        return {
          ...candidate,
          knowledge: document && version
            ? {
                documentStatus: document.resourceStatus,
                versionStatus: version.versionStatus,
                ragAvailable: isFormalEvidenceDocument(document, version.versionNo, version.versionStatus),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return accessError(error, "读取政策候选失败");
  }
}

/**
 * 人工录入一份政策候选。
 * 输入为来源、标题和虚构或已获授权的候选内容；仅 system_admin 可创建，服务端以内容哈希保证幂等。
 */
export async function POST(request: Request) {
  try {
    const user = await requireAccessUser(request);
    const body = (await request.json()) as {
      policySourceId?: string; title?: string; rawContent?: string; documentNumber?: string;
      issuingBody?: string; publishDate?: string; effectiveDate?: string; sourceReference?: string;
    };
    if (!body.policySourceId || !body.title?.trim() || !body.rawContent?.trim()) {
      return Response.json({ error: "政策来源、标题和内容不能为空" }, { status: 400 });
    }
    const result = await createPolicyCandidate(user, body as Required<Pick<typeof body, "policySourceId" | "title" | "rawContent">>);
    if (result === "forbidden") {
      return Response.json({ error: "仅管理员可创建政策候选" }, { status: 403 });
    }
    if (!result) {
      return Response.json({ error: "政策来源不存在或未启用" }, { status: 404 });
    }
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return accessError(error, "创建政策候选失败");
  }
}
