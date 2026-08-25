import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { blockedTerms } from "../db/schema";

export type BlockedMatch = { id: string; term: string; category: string; matchScope: string; matchedField: "文件名或标题" | "正文" };

export function normalizeBlockedTerm(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\u3000]+/g, "").trim();
}

export async function findBlockedMatches(input: { title?: string; fileName?: string; content?: string }) {
  const rules = await getDb().select().from(blockedTerms).where(eq(blockedTerms.enabled, true));
  const heading = normalizeBlockedTerm(`${input.title || ""}\n${input.fileName || ""}`);
  const body = normalizeBlockedTerm(input.content || "");
  const matches: BlockedMatch[] = [];
  for (const rule of rules) {
    const needle = rule.normalizedTerm;
    if (!needle) continue;
    if ((rule.matchScope === "all" || rule.matchScope === "filename") && heading.includes(needle)) {
      matches.push({ id: rule.id, term: rule.term, category: rule.category, matchScope: rule.matchScope, matchedField: "文件名或标题" });
      continue;
    }
    if ((rule.matchScope === "all" || rule.matchScope === "content") && body.includes(needle)) {
      matches.push({ id: rule.id, term: rule.term, category: rule.category, matchScope: rule.matchScope, matchedField: "正文" });
    }
  }
  return matches.slice(0, 10);
}
