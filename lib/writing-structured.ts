// 本文件定义智能写作的结构化正文与无模型模拟生成器，只使用已确认事实和已授权正式引用，不调用模型或读取私有原文件。
import type { KnowledgeCitation } from "./rag";
import type { WritingType } from "./writing";

export type WritingBlock =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "paragraph" | "notice"; text: string }
  | { id: string; type: "numbered_list"; items: string[] }
  | { id: string; type: "table"; columns: string[]; rows: string[][] };

export type StructuredWriting = {
  title: string; documentType: WritingType; recipient: string; submittingDepartment: string; dateLabel: string; blocks: WritingBlock[];
};

const pending = "【待人工核验】";
const blockId = (prefix: string, index: number) => `${prefix}-${index}`;

// 输入为当前工作区已确认事实和已授权正式引用；输出为可编辑结构化初稿，不把私有材料变成事实或 citations。
export function generateStructuredWriting(input: { type: WritingType; title: string; recipient: string; submittingDepartment: string; facts: string; references: KnowledgeCitation[]; privateReferenceCount: number }): StructuredWriting {
  const facts = input.facts.trim() || `${pending}请补充已确认的事实、日期、责任单位和工作边界。`;
  const evidence = input.references.length
    ? `正式依据已按当前账号权限筛选，可在人工核验后据实引用。`
    : `${pending}当前未检索到可作为正式引用的可靠依据，以下内容仅为中性工作框架。`;
  const actionTitle = input.type === "请示" ? "请示事项与建议" : input.type === "通知" ? "工作要求" : "工作进展与下一步安排";
  // 私有材料只可影响章节与表格的组织方式，不能把文件名、原文或摘要写入正式正文。
  const table = input.type === "请示"
    ? { columns: ["目标", "具体要求"], rows: [["工作目标", "围绕已确认事项明确推进方向和预期成果。"], ["请示事项", `${pending}请结合授权依据补充拟请示意见。`]] }
    : input.type === "通知"
      ? { columns: ["建设内容", "功能说明", "责任部门"], rows: [["工作准备", "梳理范围、依据和协同事项。", `${pending}责任部门`], ["组织实施", "按要求推进并做好过程留痕。", `${pending}责任部门`], ["结果核验", "核对落实情况并形成反馈。", `${pending}责任部门`]] }
      : { columns: input.privateReferenceCount ? ["建设内容", "功能说明", "责任部门"] : ["阶段", "主要工作", "成果"], rows: input.privateReferenceCount ? [["事项梳理", "归集已确认情况并明确工作边界。", `${pending}责任部门`], ["重点推进", "围绕问题和任务形成协同安排。", `${pending}责任部门`], ["核验反馈", "人工核验工作成果并完善记录。", `${pending}责任部门`]] : [["准备阶段", "梳理已确认事实与依据。", `${pending}工作清单`], ["推进阶段", "落实分工并跟踪事项。", `${pending}过程记录`], ["核验阶段", "人工核验结果和材料。", `${pending}正式结论`]] };
  return {
    title: input.title,
    documentType: input.type,
    recipient: input.recipient || pending,
    submittingDepartment: input.submittingDepartment || pending,
    dateLabel: pending,
    blocks: [
      { id: blockId("heading", 1), type: "heading", level: 1, text: "一、背景与必要性" },
      { id: blockId("paragraph", 1), type: "paragraph", text: `围绕“${input.title}”，为确保相关工作在职责清晰、依据充分和过程可追溯的前提下稳妥推进，现将有关情况说明如下。` },
      { id: blockId("paragraph", 2), type: "paragraph", text: `经初步梳理，当前已确认的基础情况为：${facts}。对尚未具备正式依据的金额、日期、政策条款、单位名称和责任人员，不作推断性表述，须在后续人工核验后据实补充。` },
      { id: blockId("notice", 1), type: "notice", text: evidence },
      { id: blockId("heading", 2), type: "heading", level: 1, text: `二、${actionTitle}` },
      { id: blockId("paragraph", 3), type: "paragraph", text: input.type === "请示" ? "建议在严格核验事实和授权依据的基础上，明确需请示决策的事项、边界和实施条件，避免以一般性描述替代具体决策依据。" : input.type === "通知" ? "请相关单位结合职责分工，围绕工作目标、实施要求和反馈机制细化安排，确保任务传达、执行跟踪和结果核验形成闭环。" : "围绕现阶段工作情况，应坚持问题导向与结果导向相结合，及时梳理已完成事项、待推进任务和需要协调解决的问题。" },
      { id: blockId("list", 1), type: "numbered_list", items: ["明确工作范围、责任边界和协同方式。", `依据已确认事实逐项核对时间、人员、金额和单位名称；未有依据处保留${pending}。`, "形成可执行的工作安排，并由相关责任部门人工确认。"] },
      { id: blockId("heading", 3), type: "heading", level: 1, text: "三、实施安排与保障" },
      { id: blockId("paragraph", 4), type: "paragraph", text: "建议按照统筹协调、分工落实、过程留痕、结果核验的原则推进。各项任务应明确牵头关系、协同方式和完成标准；涉及重要节点、资源投入及责任人员的内容，均须经人工确认后填入正式文稿。" },
      { id: blockId("table", 1), type: "table", columns: table.columns, rows: table.rows },
      { id: blockId("heading", 4), type: "heading", level: 1, text: "四、下一步工作要求" },
      { id: blockId("paragraph", 5), type: "paragraph", text: "请结合实际完善任务清单和配套材料，及时校验关键事实、引用依据与表格信息。对需要跨部门协调的事项，应明确沟通机制和反馈时限；对尚未核实的内容，应保留人工审核标识，不得直接作为正式结论使用。" },
      { id: blockId("heading", 5), type: "heading", level: 1, text: "五、结语" },
      { id: blockId("paragraph", 6), type: "paragraph", text: input.type === "请示" ? "以上请示，妥否，请批示。" : input.type === "通知" ? "请结合实际认真组织落实。" : "以上情况，特此汇报。" },
    ],
  };
}

// 将结构化数据转换为兼容旧版本字段的纯文本预览；表格只用于页面兼容，不用于 Word 表格生成。
export function structuredWritingToText(value: StructuredWriting) {
  return value.blocks.map((block) => {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "notice") return block.text;
    if (block.type === "numbered_list") return block.items.map((item, index) => `${index + 1}. ${item}`).join("\n");
    if (block.type === "table") return [block.columns.join(" | "), ...block.rows.map((row: string[]) => row.join(" | "))].join("\n");
    return "";
  }).join("\n\n");
}

// 验证人工编辑后的结构化正文，拒绝畸形或超大 JSON；输入为页面提交值，输出为可安全入库和导出的结构化内容或 null。
// 本函数不读写数据库，权限仍由 API 在调用前校验。
export function normalizeStructuredWriting(value: unknown): StructuredWriting | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StructuredWriting>;
  if (typeof candidate.title !== "string" || typeof candidate.documentType !== "string" || !Array.isArray(candidate.blocks) || candidate.blocks.length === 0 || candidate.blocks.length > 80) return null;
  const blocks: WritingBlock[] = [];
  for (const item of candidate.blocks) {
    if (!item || typeof item !== "object" || typeof (item as WritingBlock).id !== "string") return null;
    const block = item as WritingBlock;
    if ((block.type === "heading" || block.type === "paragraph" || block.type === "notice") && typeof block.text === "string" && block.text.length <= 8000) {
      if (block.type === "heading" && block.level !== 1 && block.level !== 2 && block.level !== 3) return null;
      blocks.push(block);
    } else if (block.type === "numbered_list" && Array.isArray(block.items) && block.items.length <= 100 && block.items.every((item) => typeof item === "string" && item.length <= 2000)) {
      blocks.push(block);
    } else if (block.type === "table" && Array.isArray(block.columns) && Array.isArray(block.rows) && block.columns.length > 0 && block.columns.length <= 6 && block.rows.length <= 100
      && block.columns.every((column) => typeof column === "string" && column.length <= 500)
      && block.rows.every((row) => Array.isArray(row) && row.length === block.columns.length && row.every((cell) => typeof cell === "string" && cell.length <= 2000))) {
      blocks.push(block);
    } else return null;
  }
  return {
    title: candidate.title.trim().slice(0, 240),
    documentType: candidate.documentType as WritingType,
    recipient: typeof candidate.recipient === "string" ? candidate.recipient.trim().slice(0, 240) : "",
    submittingDepartment: typeof candidate.submittingDepartment === "string" ? candidate.submittingDepartment.trim().slice(0, 240) : "",
    dateLabel: typeof candidate.dateLabel === "string" ? candidate.dateLabel.trim().slice(0, 100) : pending,
    blocks,
  };
}

// 读取历史 JSON 时失败则返回 null，调用方可安全回退到旧纯文本版本。
export function parseStructuredWriting(value: string): StructuredWriting | null {
  try {
    return normalizeStructuredWriting(JSON.parse(value));
  } catch { return null; }
}
