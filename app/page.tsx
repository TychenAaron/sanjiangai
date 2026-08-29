"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "工作台" | "知识会话" | "智能写作" | "政策中心" | "知识资源" | "建设总览" | "权限中心" | "治理后台";
type IconName = "home" | "chat" | "pen" | "policy" | "folder" | "admin" | "search" | "send" | "shield" | "arrow" | "refresh";

type DocumentRecord = {
  id: string; title: string; documentType: string; sourceType: string; ownerDepartment: string;
  securityLevel: string; permissionScope: string; lifecycleStatus: string; knowledgeStatus: string; resourceStatus: string;
  resourceCategory: string; sourceOrganization: string | null; documentDate: string | null; applicableScope: string | null; reliabilityScore: number; reviewNote: string | null;
  trialDataClass: string; isTrialData: boolean; fileName: string | null; parseStatus: string; indexStatus: string;
  currentVersion: number; createdBy: string; createdByUserId: string | null; createdAt: string; updatedAt: string;
};
type DocumentSummary = { total: number; pending: number; approved: number; draft: number };
type AuditLog = { id: string; action: string; operator: string; detail: string; createdAt: string };
type BlockedTerm = { id: string; term: string; category: string; matchScope: string; note: string | null; enabled: boolean; createdBy: string; createdAt: string; updatedAt: string };
type DocumentVersion = { id: string; versionNo: number; content: string; changeSummary: string; versionStatus: string; createdBy: string; createdAt: string };
type BatchUploadSummary = { total: number; succeeded: number; failed: Array<{ fileName: string; reason: string }> };
type BatchFileStatus = { fileName: string; size: number; type: string; status: "待预检" | "上传中" | "成功" | "跳过" | "失败"; reason?: string };
type KnowledgeImportBatch = { id: string; datasetName: string; totalCount: number; successCount: number; failedCount: number; skippedCount: number; status: string; createdAt: string; completedAt: string | null };
type SessionUser = { id: string; name: string; email: string; employeeNo: string | null; departmentName: string; role: string; positionLevel: number; clearanceLevel: number; status: string };
type KnowledgeResult = {
  answer: string;
  mode: "model" | "extractive" | "no_basis" | "failed";
  model: string;
  citations: Array<{ documentId: string; title: string; category: string; sourceOrganization: string | null; documentDate: string | null; version: number; sourceType: string; chunkIndex: number; location: string; score: number }>;
};
type WritingPrivateReference = {
  id: string;
  fileName: string;
  parseStatus: "parsed" | "pending_conversion" | "pending_ocr" | "failed";
  parseFormat: string;
  parseReason?: string | null;
  excerpt: string;
  locations: string[];
};
type WritingBlock =
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "paragraph" | "notice"; text: string }
  | { id: string; type: "numbered_list"; items: string[] }
  | { id: string; type: "table"; columns: string[]; rows: string[][] };
type StructuredWriting = { title: string; documentType: "请示" | "通知" | "工作情况汇报"; recipient: string; submittingDepartment: string; dateLabel: string; blocks: WritingBlock[] };

// 根据文件扩展名返回紧凑附件卡片的 CSS 图形标识，不影响上传、解析或权限判断。
function privateReferenceKind(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (["doc", "docx"].includes(extension)) return { label: "W", tone: "word" };
  if (["xls", "xlsx", "csv", "tsv"].includes(extension)) return { label: "X", tone: "excel" };
  if (["ppt", "pptx"].includes(extension)) return { label: "P", tone: "ppt" };
  if (["txt", "md"].includes(extension)) return { label: "T", tone: "text" };
  return { label: "F", tone: "file" };
}
type SearchResult = {
  documentId: string; title: string; documentType: string; sourceType: string; ownerDepartment: string;
  securityLevel: string; version: number; excerpt: string; score: number;
};
type ConversationSummary = { id: string; title: string; updatedAt: string };
type ConversationMessage = { id: string; role: "user" | "assistant"; content: string; mode: "answer" | "search"; citations: KnowledgeResult["citations"]; invalidated?: boolean };
type LocalTestAccount = { key: "admin" | "staff" | "manager" | "finance"; email: string; name: string };
type LocalTestAccountRecord = SessionUser & { readableLevels: string[] };

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9 20v-6h6v6"/></>,
  chat: <><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></>,
  pen: <><path d="M5 19h4l10-10-4-4L5 15v4Z"/><path d="m13.5 6.5 4 4M5 22h14"/></>,
  policy: <><path d="M6 3h9l4 4v14H6V3Z"/><path d="M15 3v5h5M9 12h7M9 16h7"/></>,
  folder: <><path d="M3 6h7l2 2h9v11H3V6Z"/><path d="M3 10h18"/></>,
  admin: <><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  send: <><path d="m3 11 18-8-8 18-2.5-7.5L3 11Z"/><path d="M10.5 13.5 21 3"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 2.9 8.2 7 10 4.1-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18 10a7 7 0 0 0-12-3l-2 2M6 14a7 7 0 0 0 12 3l2-2"/></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const nav: { label: View; icon: IconName }[] = [
  { label: "工作台", icon: "home" },
  { label: "知识会话", icon: "chat" },
  { label: "智能写作", icon: "pen" },
  { label: "政策中心", icon: "policy" },
  { label: "知识资源", icon: "folder" },
];

type PolicySourceRecord = { id: string; name: string; agency: string; status: string };
type PolicyCandidateRecord = {
  id: string; policySourceId: string; title: string; documentNumber: string | null; issuingBody: string | null;
  publishDate: string | null; status: string; reviewedBy: string | null; knowledgeDocumentId: string | null; knowledgeVersionId: string | null;
  knowledge: { documentStatus: string; versionStatus: string; ragAvailable: boolean } | null;
};
type OaConnectorRecord = {
  id: string; name: string; baseUrl: string; endpointPath: string; requestMethod: "GET" | "HEAD"; contentType: string; authType: "NONE" | "BEARER_TOKEN" | "API_KEY" | "BASIC_AUTH" | "CUSTOM_HEADER";
  customAuthHeaderName: string | null; headers: Record<string, string>; timeoutMs: number; enabled: boolean; hasCredentials: boolean;
  lastCheckStatus: string | null; lastCheckHttpStatus: number | null; lastCheckDurationMs: number | null; lastCheckedAt: string | null;
};

// 工作台概览仍保留既有演示卡片；政策中心的候选列表已改为读取真实 API 数据。
const policies = [
  { level: "省政府", title: "关于加快推进数字经济高质量发展的有关政策", date: "2026-08-23", state: "待审核", fresh: true },
  { level: "省科技厅", title: "青海省科技计划项目申报工作通知", date: "2026-08-21", state: "已收录", fresh: true },
  { level: "省农业农村厅", title: "高原特色农牧业产业发展支持政策汇编", date: "2026-08-16", state: "已收录", fresh: false },
];

export default function Home() {
  const [view, setView] = useState<View>("工作台");
  const [query, setQuery] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [knowledgeResult, setKnowledgeResult] = useState<KnowledgeResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [knowledgePhase, setKnowledgePhase] = useState<"retrieving" | "organizing">("retrieving");
  const knowledgeProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [askError, setAskError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [docType, setDocType] = useState("请示");
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [summary, setSummary] = useState<DocumentSummary>({ total: 0, pending: 0, approved: 0, draft: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [sessionError, setSessionError] = useState("");
  const greeting = useMemo(() => new Date().getHours() < 12 ? "上午好" : new Date().getHours() < 18 ? "下午好" : "晚上好", []);
  const canOpenAdmin = Boolean(currentUser && ["reviewer", "knowledge_admin", "system_admin"].includes(currentUser.role));

  const refreshRecords = useCallback(async () => {
    setDataLoading(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const result = await response.json() as { documents?: DocumentRecord[]; summary?: DocumentSummary; error?: string };
      if (!response.ok) throw new Error(result.error || "读取资料失败");
      setRecords(result.documents || []);
      setSummary(result.summary || { total: 0, pending: 0, approved: 0, draft: 0 });
      setDataError("");
    } catch (error) { setDataError(error instanceof Error ? error.message : "读取资料失败"); }
    finally { setDataLoading(false); }
  }, []);
  const refreshConversations = useCallback(async () => { try { const response = await fetch("/api/knowledge/conversations", { cache: "no-store" }); const data = await response.json() as { conversations?: ConversationSummary[] }; if (response.ok) setConversations(data.conversations || []); } catch { /* 会话列表读取失败不影响资料权限页面。 */ } }, []);

  // 说明：切换本机测试身份后重新读取服务端会话和资料列表。
  // 输入为空，输出是更新后的当前账号和已按权限过滤的资料；正式登录流程也复用同一读取方式。
  const refreshSessionAndRecords = useCallback(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const result = await response.json() as { user?: SessionUser; error?: string };
    if (response.ok && result.user) {
      setCurrentUser(result.user);
      setSessionError("");
      await refreshRecords();
      await refreshConversations();
    } else {
      setCurrentUser(null);
      setSessionError(result.error || "无法识别登录账号");
      setDataLoading(false);
    }
  }, [refreshConversations, refreshRecords]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => { void refreshSessionAndRecords(); }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshSessionAndRecords]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = query.trim();
    if (!question || asking) return;
    setView("知识会话");
    setLastQuestion(question); setKnowledgeResult(null); setAskError(""); setKnowledgePhase("retrieving"); setAsking(true);
    knowledgeProgressTimer.current = setTimeout(() => setKnowledgePhase("organizing"), 450);
    try {
      const response = await fetch("/api/knowledge/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: question, conversationId: conversationId || undefined }) });
      const result = await response.json() as KnowledgeResult & { error?: string; conversationId?: string };
      if (!response.ok) throw new Error(result.error || "知识检索失败");
      setKnowledgeResult(result);
      if (result.conversationId) { setConversationId(result.conversationId); await refreshConversations(); }
    } catch (error) { setAskError(error instanceof Error ? error.message : "知识检索失败"); }
    finally { if (knowledgeProgressTimer.current) clearTimeout(knowledgeProgressTimer.current); setAsking(false); }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><b>三江</b><span><strong>集团智能办公系统</strong><small>知识中枢 · 智能写作</small></span></div>
        <nav aria-label="主导航">
          <p>员工应用</p>
          {nav.map(item => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
          <p className="admin-label">平台管理</p>
          <button className={view === "权限中心" ? "active" : ""} onClick={() => setView("权限中心")}><Icon name="shield"/><span>权限中心</span></button>
          {canOpenAdmin && <button className={view === "建设总览" ? "active" : ""} onClick={() => setView("建设总览")}><Icon name="policy"/><span>建设总览</span></button>}
          {canOpenAdmin && <button className={view === "治理后台" ? "active" : ""} onClick={() => setView("治理后台")}><Icon name="admin"/><span>治理后台</span></button>}
        </nav>
        <div className="secure"><Icon name="shield" size={17}/>数据访问受集团权限保护</div>
        <button className="profile" onClick={() => setView("权限中心")}><i>{currentUser?.name?.[0] || "员"}</i><span><strong>{currentUser?.name || "正在识别账号"}</strong><small>{currentUser ? `${roleLabel(currentUser.role)} · ${currentUser.departmentName}` : "登录账号校验中"}</small></span><b>›</b></button>
      </aside>

      <section className="main">
        <header><div><span>三江集团</span><b>/</b><strong>{view}</strong></div><aside>{currentUser && <span className="identity-chip">D{currentUser.clearanceLevel} · P{currentUser.positionLevel}</span>}<em><i/>权限试用环境</em><button>使用帮助</button></aside></header>
        <div className="content">
          {sessionError && <div className="access-blocked"><Icon name="shield" size={30}/><h2>当前账号暂不能进入资料库</h2><p>{sessionError}</p><span>请由系统管理员在“权限中心”按登录邮箱配置员工级别、部门和数据权限。</span></div>}
          {!sessionError && view === "工作台" && <Dashboard greeting={greeting} userName={currentUser?.name || "员工"} query={query} setQuery={setQuery} ask={ask} docType={docType} setDocType={setDocType} go={setView} records={records} summary={summary} dataLoading={dataLoading}/>} 
          {!sessionError && view === "知识会话" && <Knowledge query={query} setQuery={setQuery} lastQuestion={lastQuestion} result={knowledgeResult} asking={asking} phase={knowledgePhase} error={askError} ask={ask} conversations={conversations} conversationId={conversationId} setConversationId={setConversationId} refreshConversations={refreshConversations}/>}
          {!sessionError && view === "政策中心" && <PolicyCenter/>}
          {!sessionError && view === "智能写作" && <WritingV2/>}
          {!sessionError && view === "知识资源" && <Library user={currentUser} records={records} loading={dataLoading} error={dataError} refresh={refreshRecords}/>} 
          {!sessionError && view === "建设总览" && canOpenAdmin && <ProjectOverview/>}
          {!sessionError && view === "权限中心" && <AccessCenter user={currentUser} refreshSessionAndRecords={refreshSessionAndRecords}/>}
          {!sessionError && view === "治理后台" && canOpenAdmin && <Admin user={currentUser} records={records} summary={summary} refresh={refreshRecords}/>} 
        </div>
      </section>
    </main>
  );
}

function Dashboard({ greeting, userName, query, setQuery, ask, docType, setDocType, go, records, summary, dataLoading }: {
  greeting: string; userName: string; query: string; setQuery: (v: string) => void; ask: (e: FormEvent) => void;
  docType: string; setDocType: (v: string) => void; go: (v: View) => void; records: DocumentRecord[]; summary: DocumentSummary; dataLoading: boolean;
}) {
  return <>
    <section className="welcome"><div><p>{greeting}，{userName}</p><h1>找得到、答得准、写得快、留得下、管得住</h1></div><span>一期：知识中枢＋智能写作</span></section>
    <form className="ask-card" onSubmit={ask}>
      <div className="card-title"><i>AI</i><strong>统一知识入口</strong><span>登录账号决定检索范围，回答标注来源、版本和原文</span></div>
      <label className="ask-input"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="例如：集团现行采购制度中，单笔50万元以上项目如何审批？"/><button aria-label="发送问题"><Icon name="send" size={18}/></button></label>
      <div className="quick"><span>快捷入口</span><button type="button" onClick={() => go("智能搜索")}>查找原文</button>{["集团采购审批要求","查找青稞项目会议纪要","公文用印流程"].map(q => <button type="button" onClick={() => setQuery(q)} key={q}>{q}</button>)}</div>
    </form>

    <section className="module-grid">
      <article className="panel writing">
        <PanelHead icon="pen" title="智能写作" sub="自由创作、大纲、模板、勘误与AI工具" action="进入写作" onClick={() => go("智能写作")}/>
        <div className="doc-types">{["请示","通知","工作情况汇报"].map(t => <button className={docType === t ? "selected" : ""} onClick={() => setDocType(t)} key={t}><i>{t[0]}</i><span><strong>{t}</strong><small>{t === "请示" ? "事项报批、项目申请" : t === "通知" ? "工作安排、事项告知" : "阶段总结、进展汇报"}</small></span></button>)}</div>
        <button className="new-doc" onClick={() => go("智能写作")}>＋ 新建{docType}</button>
      </article>
      <article className="panel sources">
        <PanelHead icon="folder" title="知识中枢" sub="平台独立、统一治理的AI资料数据库" action="知识资源" onClick={() => go("知识资源")}/>
        <div className="numbers"><div><strong>{dataLoading ? "—" : summary.total}</strong><span>全部资料</span></div><div><strong>{dataLoading ? "—" : summary.approved}</strong><span>正式知识</span></div><div><strong>{dataLoading ? "—" : summary.pending}</strong><span>待审核</span></div></div>
        <div className="sync"><span><i/>权限过滤与版本留痕生效</span><small>OA只读接入预留</small></div>
      </article>
    </section>

    <section className="capability-row">
      {[{icon:"search" as IconName,title:"智能搜索",text:"全文、语义与混合检索",go:"智能搜索" as View},{icon:"chat" as IconName,title:"知识会话",text:"RAG回答与引用溯源",go:"知识会话" as View},{icon:"folder" as IconName,title:"知识资源",text:"原文、元数据、版本与权限",go:"知识资源" as View}].map(item => <button className="panel" key={item.title} onClick={() => go(item.go)}><i><Icon name={item.icon}/></i><span><strong>{item.title}</strong><small>{item.text}</small></span><Icon name="arrow" size={16}/></button>)}
    </section>

    <section className="panel monitor">
      <PanelHead icon="policy" title="青海政策监测" sub="定期发现政府及厅局最新政策和申报要求" action="查看政策中心" onClick={() => go("政策中心")}/>
      <div className="policy-strip">{policies.slice(0,2).map(p => <button key={p.title}><em>{p.level}</em><span><strong>{p.title}</strong><small>发现时间：{p.date}</small></span><i className={p.state === "待审核" ? "pending" : ""}>{p.state}</i></button>)}</div>
    </section>

    <section className="panel recent">
      <PanelHead icon="folder" title="最近文档" sub="OA原文、上传资料、AI草稿、人工修改稿和最终定稿全程留痕" action="查看全部" onClick={() => go("知识资源")}/>
      {records.length === 0 ? <div className="no-records">尚无真实资料，进入“知识资源”添加第一份脱敏测试文件。</div> : records.slice(0,3).map(d => <button className="recent-row" key={d.id} onClick={() => go("知识资源")}><i>{d.documentType[0]}</i><span><strong>{d.title}</strong><small>{d.sourceType} · {formatDate(d.updatedAt)}</small></span><em>{statusLabel(d.knowledgeStatus)}</em><b>›</b></button>)}
    </section>

    <section className="panel extensions">
      <PanelHead icon="admin" title="后期扩展能力" sub="本期只预留接口与权限边界，不接入生产业务数据"/>
      <div>{[["财务经营","预算执行、经营指标和领导查询"],["运营分析","项目进度、任务督办和运营周报"],["业务系统","NC、ERP及后续集团业务系统"]].map(x => <button key={x[0]}><i>待接入</i><strong>{x[0]}</strong><span>{x[1]}</span></button>)}</div>
    </section>
  </>;
}

function IntelligentSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("全部来源");

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true); setError(""); setSearched(true);
    try {
      const response = await fetch("/api/knowledge/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const data = await response.json() as { results?: SearchResult[]; error?: string };
      if (!response.ok) throw new Error(data.error || "搜索失败");
      setResults(data.results || []);
    } catch (e) { setError(e instanceof Error ? e.message : "搜索失败"); }
    finally { setLoading(false); }
  }
  const visible = source === "全部来源" ? results : results.filter(item => item.sourceType === source);
  const sources = ["全部来源", ...Array.from(new Set(results.map(item => item.sourceType)))];
  return <section className="page">
    <PageTitle kicker="知识中枢" title="智能搜索" text="对当前账号有权查看的正式资料进行全文检索；语义向量与重排模型将在统一模型网关接入后增强排序。"/>
    <form className="search-console panel" onSubmit={search}><div><Icon name="search"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="输入标题、文号、制度条款、项目名称或关键词"/><button>{loading ? "搜索中…" : "搜索"}</button></div><p><Icon name="shield" size={14}/>先按登录账号、部门、岗位、数据级别和文件授权过滤，再返回检索结果。</p></form>
    <div className="search-meta"><div>{sources.map(item => <button key={item} className={source === item ? "active" : ""} onClick={() => setSource(item)}>{item}</button>)}</div>{searched && <span>找到 {visible.length} 条有权查看的结果</span>}</div>
    {error && <div className="notice error">{error}</div>}
    <div className="search-results">{!searched ? <div className="panel search-empty"><Icon name="search" size={30}/><h2>从正式知识中查找原文</h2><p>搜索结果保留文件来源、版本、责任部门和权限级别，便于核对与追溯。</p></div> : visible.length === 0 ? <div className="panel search-empty"><h2>没有找到可靠结果</h2><p>请更换关键词，或联系知识管理员补充并审核相关资料。</p></div> : visible.map((item, index) => <article className="panel search-result" key={`${item.documentId}-${index}`}><div className="result-rank">{String(index + 1).padStart(2,"0")}</div><div><header><h2>{item.title}</h2><em>V{item.version}.0</em></header><p>{item.excerpt}</p><footer><span>{item.documentType}</span><span>{item.sourceType}</span><span>{item.ownerDepartment}</span><span>{item.securityLevel}</span><b>相关度 {item.score}</b></footer></div></article>)}</div>
  </section>;
}
// 原独立检索组件保留在文件中供迁移对照，但不再作为页面入口；实际检索已合并到知识会话。
void IntelligentSearch;

function Knowledge({ query, setQuery, lastQuestion, result, asking, phase, error, ask, conversations, conversationId, setConversationId, refreshConversations }: {
  query: string; setQuery: (v:string)=>void; lastQuestion: string; result: KnowledgeResult | null; asking: boolean; phase: "retrieving" | "organizing"; error: string; ask:(e:FormEvent)=>void; conversations: ConversationSummary[]; conversationId: string | null; setConversationId: (value: string | null) => void; refreshConversations: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<{ key: string; content: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState("");
  const [mode, setMode] = useState<"answer" | "search">("answer");
  const [searchResults, setSearchResults] = useState<Array<{ title: string; category: string; sourceOrganization: string | null; documentDate: string | null; location: string; excerpt: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [conversationNotice, setConversationNotice] = useState("");
  const [deletingConversationIds, setDeletingConversationIds] = useState<string[]>([]);
  useEffect(() => { if (!conversationId) return; void (async () => { const response = await fetch(`/api/knowledge/conversations/${conversationId}`, { cache: "no-store" }); const data = await response.json() as { messages?: ConversationMessage[] }; if (response.ok) setHistory(data.messages || []); })(); }, [conversationId]);
  async function createConversation() { const response = await fetch("/api/knowledge/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "新建会话" }) }); const data = await response.json() as { conversation?: ConversationSummary }; if (response.ok && data.conversation) { setConversationId(data.conversation.id); setHistory([]); setQuery(""); setSearchResults([]); await refreshConversations(); } }
  /** 逐条软删除当前账号的会话。输入会话 ID，输出成功与失败汇总；每一项独立调用服务端权限控制，不因单项失败隐藏其他成功结果。 */
  async function deleteConversations(ids: string[]) {
    if (ids.length === 0) return;
    setDeletingConversationIds(ids);
    setConversationNotice("");
    const deletedIds: string[] = [];
    const failures: string[] = [];
    for (const id of ids) {
      try {
        const response = await fetch(`/api/knowledge/conversations/${id}`, { method: "DELETE" });
        const data = await response.json() as { error?: string };
        if (response.ok) deletedIds.push(id);
        else failures.push(data.error || "会话删除失败");
      } catch {
        failures.push("网络异常，会话未删除");
      }
    }
    if (deletedIds.includes(conversationId || "")) {
      setConversationId(null);
      setHistory([]);
      setQuery("");
      setSearchResults([]);
    }
    setSelectedConversationIds((current) => current.filter((id) => !deletedIds.includes(id)));
    setDeletingConversationIds([]);
    setConversationNotice(failures.length > 0
      ? `已删除 ${deletedIds.length} 条，${failures.length} 条失败：${failures[0]}`
      : `已删除 ${deletedIds.length} 条会话`);
    await refreshConversations();
  }
  /** 单条删除在二次确认后复用同一汇总流程，服务端拒绝时在左侧栏显示真实原因。 */
  async function deleteConversation(id: string) { if (!window.confirm("确认删除此会话？")) return; await deleteConversations([id]); }
  /** 批量删除需要两次确认，以避免误操作。 */
  async function deleteSelectedConversations() { if (selectedConversationIds.length === 0) return; if (!window.confirm(`将删除 ${selectedConversationIds.length} 条已选会话，是否继续？`) || !window.confirm("请再次确认：已选会话将从您的历史列表中删除。")) return; await deleteConversations(selectedConversationIds); }
  async function search(event: FormEvent) { event.preventDefault(); const value = query.trim(); if (!value || searching) return; setSearching(true); try { const response = await fetch("/api/knowledge/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: value, conversationId: conversationId || undefined }) }); const data = await response.json() as { results?: typeof searchResults; conversationId?: string; error?: string }; if (!response.ok) throw new Error(data.error || "资料检索失败"); setSearchResults(data.results || []); if (data.conversationId) setConversationId(data.conversationId); await refreshConversations(); } finally { setSearching(false); } }
  // 点击引用后重新请求服务端；服务端会再次校验当前资料状态和当前用户权限，不复用旧页面数据。
  async function openCitation(citation: KnowledgeResult["citations"][number]) {
    const key = `${citation.documentId}-${citation.chunkIndex}`;
    if (preview?.key === key) { setPreview(null); return; }
    setPreviewing(key); setPreviewError("");
    try {
      const response = await fetch(`/api/knowledge/citations/${citation.documentId}?chunkIndex=${citation.chunkIndex}`, { cache: "no-store" });
      const data = await response.json() as { preview?: string; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || "引用预览暂不可用");
      setPreview({ key, content: data.preview });
    } catch (loadError) { setPreviewError(loadError instanceof Error ? loadError.message : "引用预览暂不可用"); }
    finally { setPreviewing(""); }
  }
  return <section className="page knowledge-workspace">
    <PageTitle kicker="知识中枢" title="知识会话" text="通过RAG只依据员工有权查看的正式资料回答，并显示来源、版本和原文片段。"/>
    <div className="retrieval-status"><span><i/>账号权限过滤已启用</span><span><i/>引用溯源已启用</span><span className="waiting"><i/>Qwen3.8-27B等待私有模型网关</span></div>
    <div className="knowledge-chat-layout"><aside className="conversation-sidebar panel"><div className="conversation-sidebar-actions"><button className="new-conversation" onClick={() => void createConversation()}>＋ 新建会话</button><div className="conversation-bulk-actions"><label><input type="checkbox" checked={conversations.length > 0 && selectedConversationIds.length === conversations.length} onChange={(event) => setSelectedConversationIds(event.target.checked ? conversations.map((item) => item.id) : [])}/> 全选当前列表</label><span>已选 {selectedConversationIds.length} 条</span><button onClick={() => void deleteSelectedConversations()} disabled={selectedConversationIds.length === 0 || deletingConversationIds.length > 0}>批量删除</button></div>{conversationNotice && <p className="conversation-notice" role="status">{conversationNotice}</p>}</div><div className="conversation-list">{conversations.map(item => <div key={item.id} className={conversationId === item.id ? "active" : ""}><input aria-label={`选择会话 ${item.title}`} type="checkbox" checked={selectedConversationIds.includes(item.id)} onChange={(event) => setSelectedConversationIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}/><button className="conversation-select" onClick={() => setConversationId(item.id)} title={item.title}>{item.title}</button><small>{formatDate(item.updatedAt)}</small><button className="conversation-delete" aria-label="删除会话" disabled={deletingConversationIds.includes(item.id)} onClick={() => void deleteConversation(item.id)}>×</button></div>)}</div></aside>
    <div className="chat-panel">
      <div className="knowledge-mode"><button className={mode === "answer" ? "active" : ""} onClick={() => setMode("answer")}>智能问答</button><button className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}>资料检索</button></div>
      {!lastQuestion && !asking && history.length === 0 ? <div className="empty"><i><Icon name="chat" size={30}/></i><h2>您想查询什么？</h2><p>请先上传并审核一份脱敏资料。系统会先核验账号权限，再检索正式知识。</p></div> :
      <div className="conversation"><div className="question">{lastQuestion}</div>
        {history.map(message => <div className={message.role === "user" ? "question" : "answer"} key={message.id}><i>{message.role === "user" ? "我" : "AI"}</i><div><p>{message.content}</p>{message.role === "assistant" && message.citations.length > 0 && <section><strong>参考依据</strong>{message.citations.map((citation, index) => <small key={`${citation.documentId}-${index}`}>[{index + 1}]《{citation.title}》 · {citation.location}</small>)}</section>}</div></div>)}
        {asking && <div className="answer loading-answer"><i>AI</i><div><p>{phase === "retrieving" ? "正在检索正式资料…" : "正在整理回答…"}</p></div></div>}
        {error && <div className="answer"><i>!</i><div><p>{error}</p></div></div>}
          {result && <div className="answer"><i>AI</i><div><div className={`answer-mode ${result.mode}`}>{result.mode === "model" ? "依据问答" : result.mode === "extractive" ? "原文摘录" : result.mode === "failed" ? "回答暂不可用" : "暂无可靠依据"}</div>{result.answer.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {result.citations.length > 0 && <section><strong>参考依据</strong>{result.citations.map((citation, index) => { const key = `${citation.documentId}-${citation.chunkIndex}`; return <article className="citation" key={`${citation.documentId}-${index}`}><button onClick={() => void openCitation(citation)} disabled={previewing === key}>[{index + 1}]《{citation.title}》 · {citation.category} · {citation.sourceOrganization || "来源单位待补充"} · {citation.documentDate || "日期待补充"} · {citation.location}</button>{previewing === key && <p>正在读取片段…</p>}{preview?.key === key && <p>{preview.content}</p>}</article>; })}{previewError && <p>{previewError}</p>}</section>}</div></div>}
      </div>}
      {mode === "search" && <div className="search-results">{searchResults.length === 0 ? <p>输入关键词后，仅检索您有权访问的正式资料。</p> : searchResults.map((item, index) => <article className="citation" key={`${item.title}-${index}`}><strong>《{item.title}》 · {item.category}</strong><small>{item.sourceOrganization || "来源单位待补充"} · {item.documentDate || "日期待补充"} · {item.location}</small><p>{item.excerpt}</p></article>)}</div>}
      <form className="chat-input" onSubmit={mode === "answer" ? ask : search}><input value={query} onChange={e => setQuery(e.target.value)} placeholder={mode === "answer" ? "输入问题，按回车发送" : "输入关键词，检索正式资料"}/><button aria-label="发送" disabled={asking || searching}><Icon name="send"/></button></form>
    </div></div>
  </section>;
}

function PolicyCenter() {
  const [filter, setFilter] = useState("ALL");
  const [sources, setSources] = useState<PolicySourceRecord[]>([]);
  const [candidates, setCandidates] = useState<PolicyCandidateRecord[]>([]);

  // 政策中心只读取服务端已授权的来源和候选元数据，不再把演示候选当作真实资料。
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/policy-sources").then((response) => response.ok ? response.json() as Promise<{ sources?: PolicySourceRecord[] }> : { sources: [] }),
      fetch("/api/policy-candidates?page=1&pageSize=50").then((response) => response.ok ? response.json() as Promise<{ candidates?: PolicyCandidateRecord[] }> : { candidates: [] }),
    ]).then(([sourceData, candidateData]) => {
      if (!active) return;
      setSources(sourceData.sources || []);
      setCandidates(candidateData.candidates || []);
    }).catch(() => {
      if (!active) return;
      setSources([]);
      setCandidates([]);
    });
    return () => { active = false; };
  }, []);

  const visibleCandidates = candidates.filter((candidate) => filter === "ALL" || candidate.status === filter);
  const sourceName = (sourceId: string) => sources.find((source) => source.id === sourceId)?.name || "未关联来源";

  return <section className="page">
    <PageTitle kicker="外部政策情报" title="青海政策监测中心" text="定期检查青海省政府及相关厅局官网。系统负责发现和比对，管理员审核后才进入正式知识库。"/>
    <div className="policy-toolbar"><div>{[{ value: "ALL", label: "全部政策" }, { value: "PENDING_REVIEW", label: "待审核" }, { value: "APPROVED", label: "已通过候选审核" }, { value: "REJECTED", label: "已拒绝" }].map((item) => <button className={filter === item.value ? "active" : ""} onClick={() => setFilter(item.value)} key={item.value}>{item.label}</button>)}</div><button className="scan"><Icon name="refresh" size={16}/>立即检查官网</button></div>
    <div className="policy-layout">
      <div className="panel policy-list">{visibleCandidates.map((candidate) => <article key={candidate.id}><span className="gov-icon">政</span><div><div><em>{sourceName(candidate.policySourceId)}</em></div><h3>{candidate.title}</h3><p>文号：{candidate.documentNumber || "未填写"}　状态：{candidate.status}　审核人：{candidate.reviewedBy || "未审核"}　正式资料：{candidate.knowledge?.documentStatus || "未关联"}　RAG：{candidate.knowledge?.ragAvailable ? "可用" : "不可用"}</p></div><aside><i className={candidate.status === "PENDING_REVIEW" ? "pending" : ""}>{candidate.status}</i><button>查看详情</button></aside></article>)}</div>
      <aside className="panel watch-sites"><h3>监测网站</h3><p>仅采集经批准的政府官方网站</p>{["青海省人民政府","青海省科学技术厅","青海省农业农村厅","青海省工业和信息化厅","青海省发展改革委"].map((s,i) => <div key={s}><i/ ><span>{s}</span><em>{i < 3 ? "今日已检查" : "等待检查"}</em></div>)}</aside>
    </div>
  </section>;
}

const CURRENT_WRITING_WORKSPACE_KEY = "sanjiang-current-writing-workspace";

function WritingV2() {
  const [form, setForm] = useState({ documentType: "请示", title: "", recipient: "", facts: "", referenceQuery: "" });
  const [writing, setWriting] = useState<{ id: string; outline: string; references: KnowledgeResult["citations"]; privateReferences: WritingPrivateReference[]; checks: string[] } | null>(null);
  const [structuredContent, setStructuredContent] = useState<StructuredWriting | null>(null);
  const [plainContent, setPlainContent] = useState("");
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showOutlineSettings, setShowOutlineSettings] = useState(true);
  const [privateReferenceFiles, setPrivateReferenceFiles] = useState<Array<{ file: File; status: "uploading" | "error"; error?: string }>>([]);
  const [privateUploading, setPrivateUploading] = useState(false);
  const privateReferenceInput = useRef<HTMLInputElement>(null);
  const structuredEditorRef = useRef<HTMLDivElement>(null);

  // 说明：创建提纲时只使用已确认事实、正式知识库授权引用和当前工作区私有参考材料摘要，不自动发文。
  async function createOutline() {
    if (generating) return;
    setGenerating(true);
    setNotice("");
    try {
      const response = await fetch("/api/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: writing ? "update_outline" : "create", ...(writing ? { id: writing.id } : {}), ...form }),
      });
      const data = await response.json() as {
        id?: string;
        outline?: string;
        references?: KnowledgeResult["citations"];
        privateReferences?: WritingPrivateReference[];
        checks?: string[];
        generated?: StructuredWriting;
        content?: string;
        generation?: { mode?: "model" };
        error?: string;
      };
      if (!response.ok || !data.id || !data.outline || !data.content) {
        setNotice(data.error || "创建提纲失败");
        return;
      }
      setWriting({
        id: data.id,
        outline: data.outline,
        references: data.references || [],
        privateReferences: data.privateReferences || [],
        checks: data.checks || [],
      });
      setStructuredContent(data.generated || null);
      setPlainContent(data.generated ? "" : data.content);
      window.localStorage.setItem(CURRENT_WRITING_WORKSPACE_KEY, data.id);
      setShowOutlineSettings(false);
      setNotice(writing ? "正文已按同一工作区重新生成。" : "正文已生成，可继续人工编辑并多次导出 Word。 ");
    } catch {
      setNotice("创建提纲失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  }

  // 说明：文件选择确认后立刻创建或复用当前用户工作区并上传；工作区仍停留在提纲设置阶段，只有主按钮才会进入正文编辑阶段。
  async function ensureWritingWorkspace() {
    if (writing) return writing;
    if (!form.title.trim()) throw new Error("请先填写公文标题后再导入参考文件");
    const response = await fetch("/api/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_workspace", ...form }),
    });
    const data = await response.json() as { id?: string; error?: string };
    if (!response.ok || !data.id) throw new Error(data.error || "创建参考文件工作区失败");
    const workspace = { id: data.id, outline: "", references: [], privateReferences: [], checks: [] };
    setWriting(workspace);
    window.localStorage.setItem(CURRENT_WRITING_WORKSPACE_KEY, data.id);
    return workspace;
  }

  // 说明：选择器取消时不执行任何操作；选择成功后立即调用原有私有材料接口，服务端继续负责格式、数量、权限和安全检查。
  async function selectPrivateReferenceFiles(files: FileList | null) {
    if (!files?.length || privateUploading) return;
    if (!form.title.trim()) {
      setNotice("请先填写公文标题后再导入参考文件");
      if (privateReferenceInput.current) privateReferenceInput.current.value = "";
      return;
    }
    const selected = Array.from(files);
    const used = (writing?.privateReferences.length || 0) + privateReferenceFiles.length;
    const existingNames = new Set([
      ...(writing?.privateReferences.map((item) => item.fileName) || []),
      ...privateReferenceFiles.map((item) => item.file.name),
    ]);
    const accepted = selected.filter((file) => {
      if (existingNames.has(file.name)) return false;
      existingNames.add(file.name);
      return true;
    }).slice(0, Math.max(0, 3 - used));
    if (!accepted.length) {
      setNotice(used >= 3 ? "每份公文最多上传 3 个参考文件" : "同一个参考文件不能重复上传");
      if (privateReferenceInput.current) privateReferenceInput.current.value = "";
      return;
    }
    const pending = accepted.map((file) => ({ file, status: "uploading" as const }));
    setPrivateReferenceFiles((previous) => [...previous, ...pending]);
    setPrivateUploading(true);
    setNotice("");
    try {
      const workspace = await ensureWritingWorkspace();
      for (const item of pending) {
        const formData = new FormData();
        formData.set("file", item.file);
        const response = await fetch(`/api/writing/${workspace.id}/private-references`, { method: "POST", body: formData });
        const data = await response.json() as { privateReference?: WritingPrivateReference; error?: string };
        if (!response.ok || !data.privateReference) {
          setPrivateReferenceFiles((previous) => previous.map((current) => current.file === item.file ? { ...current, status: "error", error: data.error || "上传失败" } : current));
          continue;
        }
        setWriting((previous) => previous ? { ...previous, privateReferences: [data.privateReference!, ...previous.privateReferences] } : previous);
        setPrivateReferenceFiles((previous) => previous.filter((current) => current.file !== item.file));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传私有参考材料失败";
      setPrivateReferenceFiles((previous) => previous.map((item) => pending.some((current) => current.file === item.file) ? { ...item, status: "error", error: message } : item));
      setNotice(message);
    } finally {
      setPrivateUploading(false);
      if (privateReferenceInput.current) privateReferenceInput.current.value = "";
    }
  }

  // 删除只提交当前工作区和材料 ID；服务端会再次校验创建人权限，并同步清理 D1 记录与私有 R2 原文件。
  async function deletePrivateReference(referenceId: string) {
    if (!writing || privateUploading) return;
    setPrivateUploading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/writing/${writing.id}/private-references?referenceId=${encodeURIComponent(referenceId)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除私有参考材料失败");
      setWriting((previous) => previous ? { ...previous, privateReferences: previous.privateReferences.filter((item) => item.id !== referenceId) } : previous);
      setNotice("私有参考材料及其私有原文件已同步删除；请重新保存提纲以刷新摘要。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除私有参考材料失败");
    } finally {
      setPrivateUploading(false);
    }
  }

  // 说明：连续正文编辑器在用户输入时把可见标题、段落、列表和表格单元格回写到内部结构；用户无需维护区块或排版数据。
  function syncStructuredDocument(editor: HTMLDivElement, source: StructuredWriting) {
    const textByBlock = new Map<string, string>();
    const listByBlock = new Map<string, string[]>();
    const tableByBlock = new Map<string, { columns: string[]; rows: string[][] }>();
    editor.querySelectorAll<HTMLElement>("[data-writing-block]").forEach((element) => { textByBlock.set(element.dataset.writingBlock || "", element.innerText.trim()); });
    editor.querySelectorAll<HTMLElement>("[data-writing-list-item]").forEach((element) => {
      const [id, indexText] = (element.dataset.writingListItem || "").split(":"); const index = Number(indexText);
      if (!id || !Number.isInteger(index)) return;
      const values = listByBlock.get(id) || []; values[index] = element.innerText.trim(); listByBlock.set(id, values);
    });
    editor.querySelectorAll<HTMLElement>("[data-writing-table-cell]").forEach((element) => {
      const [id, rowText, columnText] = (element.dataset.writingTableCell || "").split(":"); const row = Number(rowText); const column = Number(columnText);
      if (!id || !Number.isInteger(row) || !Number.isInteger(column)) return;
      const table = tableByBlock.get(id) || { columns: [], rows: [] };
      if (row === -1) table.columns[column] = element.innerText.trim();
      else { const values = table.rows[row] || []; values[column] = element.innerText.trim(); table.rows[row] = values; }
      tableByBlock.set(id, table);
    });
    const next = {
      ...source,
      blocks: source.blocks.map((block) => {
        if (block.type === "heading" || block.type === "paragraph" || block.type === "notice") return { ...block, text: textByBlock.has(block.id) ? textByBlock.get(block.id) || "" : "" };
        if (block.type === "numbered_list") return { ...block, items: listByBlock.has(block.id) ? listByBlock.get(block.id) || [] : [] };
        if (block.type === "table") {
          const table = tableByBlock.get(block.id);
          return table ? { ...block, columns: table.columns.length ? table.columns : block.columns, rows: table.rows.length ? table.rows : block.rows } : block;
        }
        return block;
      }),
    };
    setStructuredContent(next);
    return next;
  }

  // 说明：导出前先将当前区块保存到同一工作区，服务端重新校验创建人/管理员权限，再按最新版本生成 Word。
  async function exportWord() {
    if (!writing || (!structuredContent && !plainContent.trim())) return;
    const currentStructured = structuredContent && structuredEditorRef.current ? syncStructuredDocument(structuredEditorRef.current, structuredContent) : structuredContent;
    setExporting(true);
    setNotice("");
    try {
      const saved = await fetch("/api/writing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentStructured ? { action: "save_structured", id: writing.id, structured: currentStructured } : { id: writing.id, content: plainContent }),
      });
      const savedData = await saved.json() as { error?: string; checks?: string[] };
      if (!saved.ok) throw new Error(savedData.error || "保存当前正文失败");
      const response = await fetch(`/api/writing/${writing.id}/export`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "导出 Word 失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.documentType}-${form.title || "公文"}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(`Word 已开始下载。${(savedData.checks || []).join(" ")} 导出不代表审批、发文或进入知识库。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导出 Word 失败");
    } finally {
      setExporting(false);
    }
  }

  return <section className="page writing-editor-page">
    <PageTitle kicker="智能办公" title="公文写作 V2" text="支持当前工作区私有参考材料；它们仅供本公文人工写作参考，不自动进入正式知识库。"/>
    <section className="panel writing-editor">
      <div className="writing-editor-meta">
        <div className="large-types">{["请示", "通知", "工作情况汇报"].map((type) => <button className={form.documentType === type ? "active" : ""} onClick={() => { setForm({ ...form, documentType: type }); setStructuredContent((previous) => previous ? { ...previous, documentType: type as StructuredWriting["documentType"] } : previous); }} key={type}><strong>{type}</strong></button>)}</div>
        <div className="writing-editor-headings">
          <label><span>标题 *</span><input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setStructuredContent((previous) => previous ? { ...previous, title: e.target.value } : previous); }}/></label>
          <label><span>报送/发送对象</span><input value={form.recipient} onChange={(e) => { setForm({ ...form, recipient: e.target.value }); setStructuredContent((previous) => previous ? { ...previous, recipient: e.target.value } : previous); }}/></label>
        </div>
      </div>
      {writing && <button className="writing-settings-toggle" type="button" onClick={() => setShowOutlineSettings(!showOutlineSettings)}>{showOutlineSettings ? "收起提纲与依据设置" : "重新显示提纲与依据设置"}</button>}
      {(!writing || showOutlineSettings) && <section className="writing-settings">
        <div className="writing-fields">
          <label><span>已确认事实 *</span><textarea value={form.facts} placeholder="只填写已经确认的日期、金额、人员和事项；不确定内容写待确认。" onChange={(e) => setForm({ ...form, facts: e.target.value })}/></label>
          <label><span>依据检索词</span><input value={form.referenceQuery} onChange={(e) => setForm({ ...form, referenceQuery: e.target.value })}/></label>
        </div>
        <div className="writing-private-reference-box">
          <input ref={privateReferenceInput} className="private-reference-input" type="file" multiple accept=".txt,.md,.csv,.tsv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => selectPrivateReferenceFiles(e.target.files)}/>
          <div className="private-reference-toolbar">
            <button type="button" className="private-reference-picker" onClick={() => privateReferenceInput.current?.click()} disabled={privateUploading || (writing?.privateReferences.length || 0) + privateReferenceFiles.length >= 3}>参考文件</button>
            <span>{(writing?.privateReferences.length || 0) + privateReferenceFiles.length}/3</span>
          </div>
          <div className="private-reference-list" aria-label="待上传参考文件">
            {writing?.privateReferences.map((item) => {
              const kind = privateReferenceKind(item.fileName);
              const legacyStatus = item.parseStatus === "pending_conversion" || item.parseStatus === "pending_ocr" ? "待转换/待 OCR" : "";
              return <article className="private-reference-card" key={item.id} title={item.fileName}>
                <i className={`private-reference-icon ${kind.tone}`}>{kind.label}</i>
                <span><strong>{item.fileName}</strong>{legacyStatus && <small>{legacyStatus}</small>}</span>
                <button type="button" aria-label={`移除 ${item.fileName}`} title={`移除 ${item.fileName}`} disabled={privateUploading} onClick={() => void deletePrivateReference(item.id)}>×</button>
              </article>;
            })}
            {privateReferenceFiles.map((item) => {
              const kind = privateReferenceKind(item.file.name);
              return <article className="private-reference-card" key={`${item.file.name}-${item.file.lastModified}-${item.file.size}`} title={item.file.name}>
                <i className={`private-reference-icon ${kind.tone}`}>{kind.label}</i>
                <span><strong>{item.file.name}</strong><small className={item.status === "error" ? "private-reference-error" : ""}>{item.status === "error" ? item.error : "上传中"}</small></span>
                <button type="button" aria-label={`移除 ${item.file.name}`} title={`移除 ${item.file.name}`} onClick={() => setPrivateReferenceFiles((previous) => previous.filter((current) => current.file !== item.file))}>×</button>
              </article>;
            })}
            {!writing?.privateReferences.length && !privateReferenceFiles.length && <small className="private-reference-hint">支持 Word、Excel、PPT、文本，最多 3 份</small>}
          </div>
        </div>
        <button className="primary writing-generate-button" type="button" disabled={generating} aria-busy={generating} aria-label={generating ? "正在生成" : undefined} onClick={() => void createOutline()}>
          {generating ? <><span className="writing-generate-sizer" aria-hidden="true">开始正文编写并检索依据</span><span className="writing-generate-loading"><i aria-hidden="true"/>正在生成</span></> : "开始正文编写并检索依据"}
        </button>
      </section>}
      {notice && <p className="writing-notice">{notice}</p>}
      {writing && !showOutlineSettings && <>
        {structuredContent ? <section className="writing-body structured-writing-body">
          <div className="writing-body-head"><div><h3>完整正文</h3><span>可直接修改文字、段落和表格内容；导出时保存当前文稿。</span></div></div>
          <div ref={structuredEditorRef} className="writing-document" contentEditable suppressContentEditableWarning onInput={(event) => syncStructuredDocument(event.currentTarget, structuredContent)}>
            <header className="writing-document-heading" contentEditable={false}><h1>{structuredContent.title}</h1><p>{structuredContent.documentType}　{structuredContent.recipient || "【待人工核验】"}</p></header>
            {structuredContent.blocks.map((block) => <div className={`writing-document-block ${block.type}`} key={block.id}>
              {block.type === "heading" && <div className={`writing-document-title level-${block.level}`} data-writing-block={block.id}>{block.text}</div>}
              {block.type === "paragraph" && <p data-writing-block={block.id}>{block.text}</p>}
              {block.type === "notice" && <p className="writing-document-notice" data-writing-block={block.id}>{block.text}</p>}
              {block.type === "numbered_list" && <ol>{block.items.map((item, index) => <li data-writing-list-item={`${block.id}:${index}`} key={`${block.id}-${index}`}>{item}</li>)}</ol>}
              {block.type === "table" && <table><thead><tr>{block.columns.map((column, index) => <th data-writing-table-cell={`${block.id}:-1:${index}`} key={`${block.id}-head-${index}`}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={`${block.id}-row-${rowIndex}`}>{row.map((cell, columnIndex) => <td data-writing-table-cell={`${block.id}:${rowIndex}:${columnIndex}`} key={`${block.id}-${rowIndex}-${columnIndex}`}>{cell}</td>)}</tr>)}</tbody></table>}
            </div>)}
          </div>
        </section> : <section className="writing-body structured-writing-body"><div className="writing-body-head"><div><h3>完整正文</h3><span>模型按连续正文返回，可直接全文修改；导出时保存当前文稿。</span></div></div><textarea className="writing-plain-editor" value={plainContent} onChange={(event) => setPlainContent(event.target.value)} aria-label="完整正文编辑区"/></section>}
        <div className="form-actions writing-editor-actions"><button className="submit" disabled={(!structuredContent && !plainContent.trim()) || exporting} onClick={() => void exportWord()}>{exporting ? "正在导出…" : "导出 Word"}</button></div>
      </>}
    </section>
  </section>;
}

function ProjectOverview() {
  const flow = [
    ["数据来源","OA只读同步 · 脱敏上传 · 政府公开政策 · 审核后的最终稿"],
    ["知识治理","原文存储 · 解析/OCR · 元数据 · 版本 · 权限 · 审核"],
    ["检索增强","全文检索 · Qwen3-Embedding-4B · Qwen3-Reranker-4B"],
    ["员工应用","智能搜索 · 知识会话 · 智能写作 · 政策中心"],
  ];
  return <section className="page">
    <PageTitle kicker="一期建设蓝图" title="三江集团智能问答与智能办公系统" text="按新版建设方案统一架构：私有隔离部署、浏览器访问、OA单点登录优先，核心目标是“找得到、答得准、写得快、留得下、管得住”。"/>
    <section className="overview-hero panel"><div><span>2026 一期</span><h2>知识中枢＋智能写作</h2><p>先完成可控、可追溯的知识与办公底座，再按统一用户、权限、模型网关和审计体系扩展财务与运营。</p></div><div className="goal-tags">{["找得到","答得准","写得快","留得下","管得住"].map(item => <b key={item}>{item}</b>)}</div></section>
    <section className="architecture-flow">{flow.map((item,index) => <div key={item[0]}><article className="panel"><b>0{index+1}</b><h3>{item[0]}</h3><p>{item[1]}</p></article>{index < flow.length-1 && <i>→</i>}</div>)}</section>
    <section className="overview-grid">
      <article className="panel"><h2>模型与组件</h2><ul><li><b>主模型</b><span>Qwen3.8-27B</span></li><li><b>向量模型</b><span>Qwen3-Embedding-4B</span></li><li><b>重排模型</b><span>Qwen3-Reranker-4B</span></li><li><b>OCR与版面</b><span>PaddleOCR-VL＋PP-StructureV3</span></li><li><b>调用方式</b><span>统一模型网关，可替换、可审计、可限流</span></li></ul></article>
      <article className="panel"><h2>一期数据范围</h2><ul><li><b>允许</b><span>OA正式文本与附件、批准的脱敏试用资料、政府公开政策</span></li><li><b>入库条件</b><span>来源、权限、版本和状态完整；政策与AI最终稿须人工审核</span></li><li><b>OA原则</b><span>只读连接；一期不自动回写生产OA</span></li><li><b>上传管控</b><span>后台禁止词条命中时，在原文件保存前拒绝上传并留痕</span></li></ul></article>
      <article className="panel boundary"><h2>一期明确不做</h2><ul><li>不接入NC真实财务明细与人事敏感数据</li><li>不做生产控制、自动审批、自动签发或自动发布</li><li>不做深度移动端定制和超大模型集群</li><li>财务、运营、采购、供应链、项目管理仅预留模块接口</li></ul></article>
      <article className="panel"><h2>员工使用方式</h2><ul><li><b>终端</b><span>集团办公电脑浏览器，无需逐台安装</span></li><li><b>身份</b><span>优先接入OA单点登录，试用期按登录邮箱识别</span></li><li><b>部署</b><span>集团数据中心、私有云或专属算力池隔离部署</span></li><li><b>权限</b><span>账号、部门、岗位、数据级别、文件范围与单独授权取交集</span></li></ul></article>
    </section>
  </section>;
}

function statusLabel(status: string) {
  return status === "approved" ? "已批准" : status === "pending" || status === "pending_review" ? "待审核" : status === "rejected" ? "已拒绝" : status === "archived" ? "已归档" : "草稿";
}

function roleLabel(role: string) {
  return ({ employee: "普通员工", department_head: "部门负责人", group_leader: "集团领导", reviewer: "资料审核员", knowledge_admin: "知识管理员", system_admin: "系统管理员" } as Record<string,string>)[role] || role;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function Library({ user, records, loading, error, refresh }: { user: SessionUser | null; records: DocumentRecord[]; loading: boolean; error: string; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [ingestMode, setIngestMode] = useState<"file" | "text">("file");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [batchUploadSummary, setBatchUploadSummary] = useState<BatchUploadSummary | null>(null);
  const [batchDatasetName, setBatchDatasetName] = useState("LOCAL_TRIAL_20260828");
  const [batchFileStatuses, setBatchFileStatuses] = useState<BatchFileStatus[]>([]);
  const [importBatches, setImportBatches] = useState<KnowledgeImportBatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionContent, setVersionContent] = useState("");
  const [changeSummary, setChangeSummary] = useState("人工修改");
  const [versionEditor, setVersionEditor] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [form, setForm] = useState({ title: "", documentType: "制度文件", sourceType: "人工录入", ownerDepartment: user?.departmentName || "集团办公室", securityLevel: "D2", permissionScope: "责任部门", trialDataClass: "T2-内部脱敏测试", resourceCategory: "其他", sourceOrganization: "", documentDate: "", applicableScope: "", content: "", confirmedDesensitized: false });

  function setField(name: string, value: string) { setForm(previous => ({ ...previous, [name]: value })); }
  const canManageLibrary = Boolean(user && ["reviewer", "knowledge_admin", "system_admin"].includes(user.role));
  const loadImportBatches = useCallback(async () => {
    if (!canManageLibrary) return;
    const response = await fetch("/api/knowledge-import-batches?pageSize=10", { cache: "no-store" });
    if (response.ok) { const result = await response.json() as { batches?: KnowledgeImportBatch[] }; setImportBatches(result.batches || []); }
  }, [canManageLibrary]);
  const visibleRecords = records.filter((record) =>
    (statusFilter === "all" || record.resourceStatus === statusFilter) &&
    (categoryFilter === "all" || record.resourceCategory === categoryFilter) &&
    (!sourceFilter || (record.sourceOrganization || "").includes(sourceFilter)) &&
    (!dateFrom || (record.documentDate || "") >= dateFrom) &&
    (!dateTo || (record.documentDate || "") <= dateTo),
  );

  // 归档与删除均由服务端执行权限和 D1/R2 清理；前端只显示简短结果，不显示存储键或正文。
  async function changeLifecycle(record: DocumentRecord, action: "archive" | "delete") {
    if (!window.confirm(action === "archive" ? "确认归档此资料？归档后不能作为正式依据。" : "确认删除此资料？该操作会清理资料记录和检索索引。")) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/documents/${record.id}/lifecycle`, { method: action === "archive" ? "POST" : "DELETE" });
      const result = await response.json() as { error?: string; storageCleanup?: string };
      if (!response.ok) throw new Error(result.error || "资料操作失败");
      setSelected(null); setNotice(action === "archive" ? "资料已归档，已退出检索和正式引用范围。" : "资料已删除并完成检索清理。");
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "资料操作失败"); }
    finally { setSaving(false); }
  }

  /**
   * 批量删除已选正式资料。
   * 输入为当前管理员勾选的资料 ID；输出为逐项成功/失败汇总。每项复用既有生命周期删除接口，失败不回滚已成功项。
   */
  async function deleteSelectedDocuments() {
    if (!canManageLibrary || selectedDocumentIds.length === 0) return;
    if (!window.confirm(`确认删除已选中的 ${selectedDocumentIds.length} 份资料？此操作会使资料立即退出当前检索和 RAG。`)) return;
    if (!window.confirm("请再次确认：将逐份清理资料记录、分段和向量索引，已成功删除的资料不会因其他资料失败而回滚。")) return;
    setSaving(true); setNotice(""); let succeeded = 0; const failed: string[] = [];
    try {
      for (const id of selectedDocumentIds) {
        try { const response = await fetch(`/api/documents/${id}/lifecycle`, { method: "DELETE" }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "删除失败"); succeeded += 1; }
        catch (error) { failed.push(error instanceof Error ? error.message : "删除失败"); }
      }
      setSelectedDocumentIds([]); if (selected && selectedDocumentIds.includes(selected.id)) setSelected(null);
      setNotice(`批量删除完成：成功 ${succeeded} 份，失败 ${failed.length} 份。成功项已退出当前检索、RAG 与有效引用范围。${failed.length ? `失败原因：${failed.slice(0, 3).join("；")}` : ""}`);
      await refresh();
    } finally { setSaving(false); }
  }
  async function save(submitMode: "draft" | "pending") {
    if (ingestMode === "file") { await saveUpload(); return; }
    if (!form.title.trim() || !form.content.trim()) { setNotice("请先填写文件名称和正文内容。"); return; }
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, submitMode }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "保存失败");
      setForm({ ...form, title: "", content: "", confirmedDesensitized: false }); setAdding(false);
      setNotice("资料已保存并自动成为正式资料；解析成功后可进入当前检索范围。");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function saveUpload() {
    if (!uploadFiles.length) { setNotice("请先选择脱敏文件。"); return; }
    if (!form.confirmedDesensitized) { setNotice("请先勾选脱敏确认。"); return; }
    setSaving(true); setNotice("");
    const failed: BatchUploadSummary["failed"] = [];
    let succeeded = 0;
    let batchId = "";
    try {
      const created = await fetch("/api/knowledge-import-batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ datasetName: batchDatasetName, totalCount: uploadFiles.length, documentType: form.documentType, resourceCategory: form.resourceCategory, securityLevel: form.securityLevel, permissionScope: form.permissionScope, ownerDepartment: form.ownerDepartment, trialDataClass: form.trialDataClass, sourceOrganization: form.sourceOrganization, documentDate: form.documentDate, applicableScope: form.applicableScope }) });
      const batchResult = await created.json() as { batch?: { id?: string }; error?: string };
      if (!created.ok || !batchResult.batch?.id) throw new Error(batchResult.error || "创建资料导入批次失败");
      batchId = batchResult.batch.id;
      // 每份文件仍单独走既有服务端安全链：格式/大小、禁止词、R2 回滚、D1 版本与待审核状态互不影响。
      for (const file of uploadFiles) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        if (!new Set(["docx", "pdf", "txt", "md", "xlsx", "xls", "pptx", "ppt"]).has(extension)) { const reason = "不支持的文件类型"; failed.push({ fileName: file.name, reason }); setBatchFileStatuses(items => items.map(item => item.fileName === file.name && item.size === file.size ? { ...item, status: "失败", reason } : item)); continue; }
        if (file.size <= 0) { const reason = "文件为空"; failed.push({ fileName: file.name, reason }); setBatchFileStatuses(items => items.map(item => item.fileName === file.name && item.size === file.size ? { ...item, status: "失败", reason } : item)); continue; }
        setBatchFileStatuses(items => items.map(item => item.fileName === file.name && item.size === file.size ? { ...item, status: "上传中", reason: undefined } : item));
        const payload = new FormData();
        payload.set("file", file); payload.set("title", uploadFiles.length === 1 ? form.title : file.name.replace(/\.[^.]+$/, "")); payload.set("documentType", form.documentType);
        payload.set("ownerDepartment", form.ownerDepartment); payload.set("securityLevel", form.securityLevel);
        payload.set("permissionScope", form.permissionScope); payload.set("trialDataClass", form.trialDataClass); payload.set("confirmedDesensitized", "true");
        payload.set("resourceCategory", form.resourceCategory); payload.set("sourceOrganization", form.sourceOrganization);
        payload.set("documentDate", form.documentDate); payload.set("applicableScope", form.applicableScope);
        payload.set("batchId", batchId); payload.set("batchItemKey", `${file.name}:${file.size}:${file.lastModified}`);
        try {
          const response = await fetch("/api/documents/upload", { method: "POST", body: payload });
          const raw = await response.text(); let result: { error?: string } = {};
          try { result = JSON.parse(raw) as { error?: string }; } catch { /* 运行环境可能在路由前拒绝异常请求体，仍显示状态码对应提示。 */ }
          if (!response.ok) { const reason = response.status === 413 ? "请求体超过当前运行环境限制，请拆分文件后重试" : result.error || "上传失败"; failed.push({ fileName: file.name, reason }); setBatchFileStatuses(items => items.map(item => item.fileName === file.name && item.size === file.size ? { ...item, status: response.status === 409 ? "跳过" : "失败", reason } : item)); continue; }
          succeeded += 1;
          setBatchFileStatuses(items => items.map(item => item.fileName === file.name && item.size === file.size ? { ...item, status: "成功" } : item));
        } catch { const reason = "网络请求失败"; failed.push({ fileName: file.name, reason }); setBatchFileStatuses(items => items.map(item => item.fileName === file.name && item.size === file.size ? { ...item, status: "失败", reason } : item)); }
      }
      await fetch(`/api/knowledge-import-batches/${batchId}`, { method: "POST" });
      setBatchUploadSummary({ total: uploadFiles.length, succeeded, failed });
      setUploadFiles([]); setForm({ ...form, title: "", content: "", confirmedDesensitized: false });
      setNotice(`本批共处理 ${uploadFiles.length} 份：成功 ${succeeded} 份，失败 ${failed.length} 份。解析成功的文件已自动成为正式资料。`);
      await refresh();
      await loadImportBatches();
    } catch (error) { setNotice(error instanceof Error ? error.message : "上传失败"); }
    finally { setSaving(false); }
  }

  async function openRecord(record: DocumentRecord) {
    setSelected(record); setVersionEditor(false); setNotice("");
    const response = await fetch(`/api/documents/${record.id}/versions`, { cache: "no-store" });
    const result = await response.json() as { versions?: DocumentVersion[]; error?: string };
    if (!response.ok) { setNotice(result.error || "读取版本失败"); return; }
    setVersions(result.versions || []); setVersionContent(result.versions?.[0]?.content || "");
  }
  /** 仅资料管理角色可调用服务端白名单元数据接口；上传时间不在请求体中，避免被浏览器篡改。 */
  async function editMetadata(record: DocumentRecord) {
    const resourceCategory = window.prompt("资料类别", record.resourceCategory || "") ?? record.resourceCategory;
    const sourceOrganization = window.prompt("来源单位", record.sourceOrganization || "") ?? record.sourceOrganization;
    const applicableScope = window.prompt("适用范围", record.applicableScope || "") ?? record.applicableScope;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/documents/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceCategory, sourceOrganization, applicableScope }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "更新资料信息失败");
      setNotice("资料信息已更新，上传时间保持不变。"); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "更新资料信息失败"); }
    finally { setSaving(false); }
  }

  async function saveVersion() {
    if (!selected || !versionContent.trim()) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/documents/${selected.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: versionContent, changeSummary }) });
      const result = await response.json() as { error?: string; version?: number };
      if (!response.ok) throw new Error(result.error || "创建新版本失败");
      setVersionEditor(false); await refresh();
      await openRecord({ ...selected, currentVersion: result.version || selected.currentVersion + 1, knowledgeStatus: "approved" });
      setNotice(`V${result.version}.0已生成并自动生效，旧版本仍完整保留。`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "创建新版本失败"); }
    finally { setSaving(false); }
  }

  return <section className="page"><PageTitle kicker="知识中枢" title="知识资源" text="统一管理OA转载、人工上传、政府政策、AI草稿、人工修改稿和最终定稿；原文、元数据、权限和版本同步留存。"/>
    <div className="resource-capabilities">{[["多级目录","按业务、部门和专题组织"],["元数据与标签","来源、文号、状态、密级、责任人"],["版本与时序","现行、修订、废止完整留痕"],["知识加工","解析、切片、抽取、向量与结构化"],["检索与统计","全文/语义/混合检索及访问统计"]].map(item => <div className="panel" key={item[0]}><strong>{item[0]}</strong><span>{item[1]}</span></div>)}</div>
    <div className="data-flow"><div><b>01</b><strong>原始资料层</strong><span>OA原文、政府网页、人工录入</span></div><i>→</i><div><b>02</b><strong>加工与草稿层</strong><span>解析文本、AI草稿、人工修改稿</span></div><i>→</i><div><b>03</b><strong>正式知识层</strong><span>经审核的现行文件和最终定稿</span></div></div>
    <div className="library-actions"><div><strong>资料台账</strong><span>共 {records.length} 份真实记录</span></div>{canManageLibrary && <button onClick={() => setAdding(!adding)}>{adding ? "取消导入" : "＋ 集团资料批量导入"}</button>}</div>
    {notice && <div className="notice">{notice}</div>}
    {canManageLibrary && importBatches.length > 0 && <section className="panel import-batch-history"><div><strong>最近资料导入批次</strong><span>每个批次和逐文件结果均已持久化，可用于核对导入数量与失败原因。</span></div>{importBatches.map(batch => <article key={batch.id}><b title={batch.datasetName}>{batch.datasetName}</b><span>{batch.totalCount} 份 · 成功 {batch.successCount} · 失败 {batch.failedCount} · 跳过 {batch.skippedCount}</span><em className={`record-status ${batch.status}`}>{batch.status === "completed" ? "已完成" : "处理中"}</em></article>)}</section>}
    {adding && <div className="panel ingest-form">
      <div className="trial-rule"><Icon name="shield" size={18}/><div><strong>当前为试用数据入口</strong><span>只允许公开资料、内部脱敏测试资料和部门隔离测试资料；真实敏感资料与禁止项不得上传。</span></div></div>
      <div className="ingest-mode"><button className={ingestMode === "file" ? "active" : ""} onClick={() => setIngestMode("file")}>上传文件</button><button className={ingestMode === "text" ? "active" : ""} onClick={() => setIngestMode("text")}>粘贴正文</button><span>{ingestMode === "file" ? "支持 DOCX、PDF、TXT、MD、XLSX、XLS、PPTX、PPT；XLS/PPT 可安全保存并按状态继续处理。" : "适合快速粘贴一小段脱敏制度进行测试。"}</span></div>
      {ingestMode === "file" && <><label className="file-drop"><input type="file" multiple accept=".docx,.pdf,.txt,.md,.xlsx,.xls,.pptx,.ppt" onChange={event => { const files = [...(event.target.files || [])]; const unique = files.filter((file, index) => files.findIndex(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index); setUploadFiles(unique); setBatchFileStatuses(unique.map(file => ({ fileName: file.name, size: file.size, type: file.name.split(".").pop()?.toUpperCase() || "FILE", status: "待预检" }))); setBatchUploadSummary(null); if (unique.length === 1 && !form.title) setField("title", unique[0].name.replace(/\.[^.]+$/, "")); }}/><Icon name="folder" size={24}/><span><strong>{uploadFiles.length ? `已选择 ${uploadFiles.length} 份文件` : "选择脱敏文件"}</strong><small>{uploadFiles.length === 1 ? `${uploadFiles[0].name} · ${(uploadFiles[0].size / 1024).toFixed(1)} KB` : "可一次选择多份文件；解析成功后自动成为正式资料"}</small></span></label><div className="batch-file-list">{batchFileStatuses.map(item => <div key={`${item.fileName}-${item.size}`}><b title={item.fileName}>{item.fileName}</b><span>{item.type} · {(item.size / 1024).toFixed(1)} KB</span><em className={`batch-status ${item.status}`}>{item.status}{item.reason ? `：${item.reason}` : ""}</em></div>)}</div>{batchUploadSummary && <div className="notice"><strong>本批处理结果：</strong>共 {batchUploadSummary.total} 份，成功 {batchUploadSummary.succeeded} 份，失败或跳过 {batchUploadSummary.failed.length} 份。结果已保存到批次记录。</div>}</>}
      <div className="form-grid">
        <label><span>{ingestMode === "file" ? "资料集名称 *" : "文件名称 *"}</span><input value={ingestMode === "file" ? batchDatasetName : form.title} onChange={e => ingestMode === "file" ? setBatchDatasetName(e.target.value) : setField("title", e.target.value)} placeholder={ingestMode === "file" ? "例如：LOCAL_TRIAL_20260828" : "例如：集团采购管理办法（试行）"}/></label>
        <label><span>试用数据类别 *</span><select value={form.trialDataClass} onChange={e => { const value = e.target.value; setField("trialDataClass", value); if (value === "T1-公开资料") { setField("securityLevel", "D1"); setField("permissionScope", "公司全员"); } if (value === "T3-部门隔离测试") setField("permissionScope", "责任部门"); }}><option>T1-公开资料</option><option>T2-内部脱敏测试</option><option>T3-部门隔离测试</option></select></label>
        <label><span>文件类型</span><select value={form.documentType} onChange={e => setField("documentType", e.target.value)}><option>制度文件</option><option>通知</option><option>请示</option><option>工作情况汇报</option><option>会议纪要</option><option>政策文件</option><option>其他资料</option></select></label>
        <label><span>数据来源</span><select disabled={ingestMode === "file"} value={ingestMode === "file" ? "文件上传" : form.sourceType} onChange={e => setField("sourceType", e.target.value)}><option>文件上传</option><option>人工录入</option><option>OA批量导出</option><option>AI生成定稿</option><option>政府官网</option></select></label>
        <label><span>责任部门</span><select value={form.ownerDepartment} onChange={e => setField("ownerDepartment", e.target.value)}><option>集团办公室</option><option>科技与信息化部门</option><option>财务管理部</option><option>运营管理部</option><option>所属子公司</option></select></label>
        <label><span>数据级别</span><select disabled={form.trialDataClass === "T1-公开资料"} value={form.securityLevel} onChange={e => setField("securityLevel", e.target.value)}><option value="D1">D1（公开）</option><option value="D2">D2（内部）</option>{(user?.clearanceLevel || 0) >= 3 && <option value="D3">D3（敏感）</option>}<option value="D4">D4（机密，当前在线入口不支持）</option></select></label>
        <label><span>可见范围 / ACL</span><select disabled={form.trialDataClass === "T1-公开资料" || form.trialDataClass === "T3-部门隔离测试"} value={form.permissionScope} onChange={e => setField("permissionScope", e.target.value)}><option>公司全员</option><option>集团本部</option><option>责任部门</option><option>领导班子</option><option>指定人员</option></select></label>
        <label><span>资料类别</span><select value={(form as Record<string, string>).resourceCategory || form.documentType} onChange={e => setField("resourceCategory", e.target.value)}><option>制度规范</option><option>正式通知</option><option>工作方案</option><option>会议纪要</option><option>合同模板</option><option>项目资料</option><option>其他</option></select></label>
        <label><span>来源单位</span><input value={(form as Record<string, string>).sourceOrganization || ""} onChange={e => setField("sourceOrganization", e.target.value)} placeholder="可在审核前补充"/></label>
        <label><span>文件日期</span><input type="date" value={(form as Record<string, string>).documentDate || ""} onChange={e => setField("documentDate", e.target.value)}/></label>
        <label><span>适用范围</span><input value={(form as Record<string, string>).applicableScope || ""} onChange={e => setField("applicableScope", e.target.value)} placeholder="可在审核前补充"/></label>
      </div>
      {ingestMode === "text" && <label className="content-field"><span>正文内容 *</span><textarea value={form.content} onChange={e => setField("content", e.target.value)} placeholder="粘贴一小段脱敏测试正文。系统会自动切分成可检索片段。"/></label>}
      <label className="confirm-check"><input type="checkbox" checked={form.confirmedDesensitized} onChange={e => setForm(previous => ({ ...previous, confirmedDesensitized: e.target.checked }))}/><span>我确认该资料已经脱敏，不含真实财务明细、员工隐私、客户个人信息、账号密码、密钥、未公开合同价格及涉密内容。</span></label>
      <div className="form-actions"><small>系统将登录账号、部门、员工级别、数据级别和查看范围共同用于权限判断。</small>{ingestMode === "text" && <button disabled={saving} onClick={() => void save("draft")}>保存草稿</button>}<button disabled={saving} className="submit" onClick={() => void save("pending")}>{saving ? "正在处理…" : ingestMode === "file" ? "上传、解析并提交审核" : "保存并提交审核"}</button></div>
    </div>}
    {error && <div className="notice error">数据库暂时无法读取：{error}</div>}
    <div className="library-filters"><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">全部状态</option><option value="pending_review">待审核</option><option value="approved">已批准</option><option value="rejected">已拒绝</option><option value="archived">已归档</option></select><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">全部类别</option>{[...new Set(records.map(item => item.resourceCategory))].map(item => <option key={item} value={item}>{item}</option>)}</select><input value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} placeholder="来源单位"/><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} title="文件日期起始"/><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} title="文件日期截止"/></div>
    {canManageLibrary && <div className="bulk-document-actions"><label><input type="checkbox" checked={visibleRecords.length > 0 && visibleRecords.every(record => selectedDocumentIds.includes(record.id))} onChange={event => setSelectedDocumentIds(event.target.checked ? visibleRecords.map(record => record.id) : [])}/>全选当前页</label><span>已选 {selectedDocumentIds.length} 份</span><button disabled={saving || selectedDocumentIds.length === 0} onClick={() => void deleteSelectedDocuments()}>批量删除</button></div>}
    <div className="panel library-table"><div className="table-head"><span>{canManageLibrary ? "选择 / 资料" : "资料"}</span><span>类别与来源</span><span>系统可靠性</span><span>状态</span><span>文件日期</span></div>
      {loading ? <div className="table-empty">正在读取资料数据库…</div> : visibleRecords.length === 0 ? <div className="table-empty">当前筛选范围内没有可见资料。</div> : visibleRecords.map(d => <div className="library-row" key={d.id}>{canManageLibrary && <input aria-label={`选择 ${d.title}`} type="checkbox" checked={selectedDocumentIds.includes(d.id)} onChange={event => setSelectedDocumentIds(ids => event.target.checked ? [...new Set([...ids, d.id])] : ids.filter(id => id !== d.id))}/>}<button className={selected?.id === d.id ? "selected-row" : ""} onClick={() => { void openRecord(d); }}><span><i>{d.documentType[0]}</i><span><b>{d.title}</b><small>{d.ownerDepartment} · {d.permissionScope}{d.fileName ? ` · ${d.fileName.split(".").pop()?.toUpperCase()} · ${d.parseStatus === "parsed" ? "已解析" : d.parseStatus === "pending_conversion" ? "待转换解析" : "待 OCR"}` : ""}</small></span></span><span>{d.resourceCategory || "未分类"}<small>{d.sourceOrganization || "待补充来源"}</small></span><span>系统默认</span><span><em className={`record-status ${d.resourceStatus}`}>{statusLabel(d.resourceStatus)}</em></span><span>{d.documentDate || "待补充"}</span></button></div>)}
    </div>
    {selected && <section className="panel version-panel"><div className="version-head"><div><strong>{selected.title}</strong><span>版本链 · 原始内容不覆盖</span></div>{canManageLibrary && <span className="form-actions"><button onClick={() => void editMetadata(selected)}>编辑资料信息</button><button onClick={() => { setVersionEditor(!versionEditor); setVersionContent(versions[0]?.content || ""); }}>{versionEditor ? "取消修改" : "＋ 创建新版本"}</button></span>}</div>
      {canManageLibrary && versionEditor && <div className="version-editor"><label><span>修改说明</span><input value={changeSummary} onChange={e => setChangeSummary(e.target.value)} placeholder="例如：根据2026年第3次办公会意见修订"/></label><label><span>新版本正文</span><textarea value={versionContent} onChange={e => setVersionContent(e.target.value)}/></label><button disabled={saving} onClick={() => void saveVersion()}>{saving ? "正在生成…" : "生成新版本并自动生效"}</button></div>}
      <div className="version-list">{versions.map(version => <article key={version.id}><b>V{version.versionNo}.0</b><div><strong>{version.changeSummary}</strong><span>{version.createdBy} · {formatDate(version.createdAt)}</span></div><em className={`record-status ${version.versionStatus}`}>{statusLabel(version.versionStatus)}</em></article>)}</div>
      <div className="resource-metadata"><span>类别：{selected.resourceCategory || "待补充"}</span><span>来源单位：{selected.sourceOrganization || "待补充"}</span><span>适用范围：{selected.applicableScope || "待补充"}</span><span>可靠性：系统默认</span><span>上传时间：{formatDate(selected.createdAt)}</span>{selected.reviewNote && <span>最近审核说明：{selected.reviewNote}</span>}</div>
      {canManageLibrary && selected.resourceStatus !== "archived" && <div className="form-actions"><button disabled={saving} onClick={() => void changeLifecycle(selected, "archive")}>归档资料</button><button disabled={saving} onClick={() => void changeLifecycle(selected, "delete")}>删除资料</button></div>}
    </section>}
  </section>;
}

function Admin({ user, records, summary, refresh }: { user: SessionUser | null; records: DocumentRecord[]; summary: DocumentSummary; refresh: () => Promise<void> }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [blockedTerms, setBlockedTerms] = useState<BlockedTerm[]>([]);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [ruleForm, setRuleForm] = useState({ term: "", category: "涉密与敏感事项", matchScope: "all", note: "" });
  const pending = records.filter(item => item.knowledgeStatus === "pending");
  const canManageRules = Boolean(user && ["system_admin", "knowledge_admin"].includes(user.role));

  const loadLogs = useCallback(async () => {
    const response = await fetch("/api/audit", { cache: "no-store" });
    if (response.ok) { const data = await response.json() as { logs?: AuditLog[] }; setLogs(data.logs || []); }
  }, []);
  const loadBlockedTerms = useCallback(async () => {
    if (!canManageRules) return;
    const response = await fetch("/api/blocked-terms", { cache: "no-store" });
    if (response.ok) { const data = await response.json() as { terms?: BlockedTerm[] }; setBlockedTerms(data.terms || []); }
  }, [canManageRules]);
  useEffect(() => { void (async () => { await loadLogs(); await loadBlockedTerms(); })(); }, [loadLogs, loadBlockedTerms, records.length]);

  async function addBlockedTerm() {
    if (ruleForm.term.trim().length < 2) { setMessage("禁止上传词条至少填写2个字符，避免单字误拦截。"); return; }
    setWorking("new-rule"); setMessage("");
    try {
      const response = await fetch("/api/blocked-terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ruleForm) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "添加词条失败");
      setRuleForm({ ...ruleForm, term: "", note: "" }); setMessage("禁止上传词条已启用。新文件将在写入资料库前自动检查。");
      await loadBlockedTerms(); await loadLogs();
    } catch (error) { setMessage(error instanceof Error ? error.message : "添加词条失败"); }
    finally { setWorking(""); }
  }

  async function toggleBlockedTerm(item: BlockedTerm) {
    setWorking(item.id); setMessage("");
    try {
      const response = await fetch(`/api/blocked-terms/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !item.enabled }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "更新词条失败");
      await loadBlockedTerms(); await loadLogs();
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新词条失败"); }
    finally { setWorking(""); }
  }

  async function deleteBlockedTerm(item: BlockedTerm) {
    setWorking(item.id); setMessage("");
    try {
      const response = await fetch(`/api/blocked-terms/${item.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "删除词条失败");
      setMessage(`词条“${item.term}”已删除。`); await loadBlockedTerms(); await loadLogs();
    } catch (error) { setMessage(error instanceof Error ? error.message : "删除词条失败"); }
    finally { setWorking(""); }
  }

  async function review(id: string, decision: "approve" | "reject") {
    setWorking(id); setMessage("");
    try {
      const response = await fetch(`/api/documents/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reviewer: "资料审核员" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "审核失败");
      setMessage(decision === "approve" ? "审核通过：该版本已进入正式知识层。" : "资料已退回修改。");
      await refresh(); await loadLogs();
    } catch (e) { setMessage(e instanceof Error ? e.message : "审核失败"); }
    finally { setWorking(""); }
  }

  return <section className="page"><PageTitle kicker="平台治理" title="治理后台" text="统一管理组织用户、知识资源、审核发布、上传规则、模型、模板、运行分析与审计。"/>
    <div className="admin-grid">{[
      ["知识资源管理","多级目录、元数据、标签、版本和失效处理",`${summary.total}份资料`],
      ["智能搜索管理","全文、语义、混合检索、召回测试与同步历史","全文检索已启用"],
      ["知识会话管理","RAG应用、提示词、引用、反馈和会话统计","权限检索已启用"],
      ["智能写作管理","文档模板、大纲模板、写作规则和应用管理","一期界面已建立"],
      ["数据接入","OA只读同步、人工上传、政府官网监测",`${summary.pending}项待处理`],
      ["组织用户与权限","组织、员工级别、岗位、角色和权限组","账号识别已启用"],
      ["上传管控","后台禁止词条、入库前拦截、审计留痕",`${blockedTerms.filter(item => item.enabled).length}条已启用`],
      ["模型与算力","Qwen3.8-27B、Embedding、Reranker、OCR","统一网关已预留"],
      ["运行分析与审计","使用量、命中率、反馈、同步和配置记录",`${logs.length}条审计记录`],
      ["扩展模块管理","财务、运营、采购、供应链和项目管理","仅预留接口"],
    ].map(x => <button className="panel" key={x[0]}><span><strong>{x[0]}</strong><small>{x[1]}</small></span><em>{x[2]}</em><Icon name="arrow" size={17}/></button>)}</div>
    {message && <div className="notice admin-notice">{message}</div>}
    <OaConnectorAdmin isSystemAdmin={user?.role === "system_admin"}/>
    {canManageRules && <section className="panel upload-control-panel"><div className="control-head"><div><h2>禁止上传词条库</h2><p>命中规则时，系统在保存原文件之前拒绝上传，并记录操作账号、文件名和命中词条。</p></div><b>{blockedTerms.filter(item => item.enabled).length}条生效中</b></div>
      <div className="rule-form"><label><span>禁止词条 *</span><input value={ruleForm.term} onChange={event => setRuleForm({ ...ruleForm, term: event.target.value })} placeholder="例如：某保密项目代号"/></label><label><span>分类</span><select value={ruleForm.category} onChange={event => setRuleForm({ ...ruleForm, category: event.target.value })}><option>涉密与敏感事项</option><option>个人隐私</option><option>财务与合同敏感信息</option><option>账号口令与密钥</option><option>自定义禁止项</option></select></label><label><span>检查范围</span><select value={ruleForm.matchScope} onChange={event => setRuleForm({ ...ruleForm, matchScope: event.target.value })}><option value="all">文件名＋标题＋正文</option><option value="filename">仅文件名和标题</option><option value="content">仅正文</option></select></label><label><span>管理备注</span><input value={ruleForm.note} onChange={event => setRuleForm({ ...ruleForm, note: event.target.value })} placeholder="填写设置原因或批准人"/></label><button disabled={working === "new-rule"} onClick={() => void addBlockedTerm()}>{working === "new-rule" ? "正在添加…" : "添加并立即启用"}</button></div>
      <div className="rule-list"><div><span>词条</span><span>分类</span><span>检查范围</span><span>状态</span><span>操作</span></div>{blockedTerms.length === 0 ? <p>尚未设置词条。建议先加入用于测试的虚构项目代号，验证拦截后再设置正式规则。</p> : blockedTerms.map(item => <article key={item.id}><span><b>{item.term}</b><small>{item.note || `由${item.createdBy}设置`}</small></span><span>{item.category}</span><span>{item.matchScope === "all" ? "文件名＋正文" : item.matchScope === "filename" ? "仅文件名" : "仅正文"}</span><span><em className={item.enabled ? "enabled" : "disabled"}>{item.enabled ? "已启用" : "已停用"}</em></span><span><button disabled={working === item.id} onClick={() => void toggleBlockedTerm(item)}>{item.enabled ? "停用" : "启用"}</button><button disabled={working === item.id} className="delete" onClick={() => void deleteBlockedTerm(item)}>删除</button></span></article>)}</div>
      <div className="control-note"><Icon name="shield" size={17}/><span><strong>拦截范围：</strong>Word/TXT文件上传、粘贴正文、新版本正文。规则只检查后续入库内容，不自动删除已经存在的资料。</span></div>
    </section>}
    <div className="governance-grid">
      <section className="panel review-panel"><h2>资料审核队列 <em>{pending.length}</em></h2><p>只有审核通过的版本才能进入正式知识库，供后续AI检索引用。</p>
        {pending.length === 0 ? <div className="queue-empty">暂无待审核资料</div> : pending.map(item => <article key={item.id}><div><strong>{item.title}</strong><span>{item.documentType} · {item.sourceType} · {item.permissionScope} · V{item.currentVersion}.0</span></div><button disabled={working === item.id} onClick={() => void review(item.id, "reject")}>退回</button><button disabled={working === item.id} className="approve" onClick={() => void review(item.id, "approve")}>审核通过</button></article>)}
      </section>
      <section className="panel audit-panel"><h2>最近审计记录</h2><p>关键操作自动记录操作人、对象和时间。</p>{logs.length === 0 ? <div className="queue-empty">暂无操作记录</div> : logs.slice(0,8).map(log => <article key={log.id}><i/><div><strong>{log.action} · {log.operator}</strong><span>{log.detail}</span><small>{formatDate(log.createdAt)}</small></div></article>)}</section>
    </div>
  </section>;
}

function OaConnectorAdmin({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const emptyForm = { name: "", baseUrl: "", endpointPath: "", requestMethod: "GET" as const, contentType: "application/json", authType: "NONE" as OaConnectorRecord["authType"], customAuthHeaderName: "", headersText: "{}", timeoutMs: 15000, enabled: false, token: "", appKey: "", appSecret: "", apiKey: "", username: "", password: "", customHeaderValue: "" };
  const [connectors, setConnectors] = useState<OaConnectorRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!isSystemAdmin) return;
    const response = await fetch("/api/oa-connectors", { cache: "no-store" });
    const result = await response.json() as { connectors?: OaConnectorRecord[]; error?: string };
    if (response.ok) setConnectors(result.connectors || []); else setMessage(result.error || "读取 OA 配置失败");
  }, [isSystemAdmin]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function edit(connector: OaConnectorRecord) {
    // 凭证从不回填到浏览器；重新编辑时只有新输入的凭证才会替换服务端密文。
    setEditingId(connector.id);
    setForm({ ...emptyForm, name: connector.name, baseUrl: connector.baseUrl, endpointPath: connector.endpointPath, requestMethod: connector.requestMethod, contentType: connector.contentType, authType: connector.authType, customAuthHeaderName: connector.customAuthHeaderName || "", headersText: JSON.stringify(connector.headers), timeoutMs: connector.timeoutMs, enabled: connector.enabled });
    setMessage(connector.hasCredentials ? "已保存服务端凭证；如需替换，请重新输入。" : "正在编辑 OA 配置。");
  }

  async function save() {
    setWorking("save"); setMessage("");
    try {
      let headers: Record<string, string>; try { headers = JSON.parse(form.headersText) as Record<string, string>; } catch { throw new Error("Header 配置必须是 JSON 对象"); }
      const credentials = Object.fromEntries(Object.entries({ token: form.token, appKey: form.appKey, appSecret: form.appSecret, apiKey: form.apiKey, username: form.username, password: form.password, customHeaderValue: form.customHeaderValue }).filter(([, value]) => value.trim()));
      const payload = { ...form, headers, credentials: Object.keys(credentials).length ? credentials : undefined };
      const response = await fetch(editingId ? `/api/oa-connectors/${editingId}` : "/api/oa-connectors", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "保存 OA 配置失败");
      setForm(emptyForm); setEditingId(null); setMessage("OA 配置已保存。测试连接不会同步或导入任何资料。"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存 OA 配置失败"); }
    finally { setWorking(""); }
  }

  async function test(id: string) {
    setWorking(`test-${id}`); setMessage("");
    try {
      const response = await fetch(`/api/oa-connectors/${id}/test`, { method: "POST" });
      const result = await response.json() as { status?: string; httpStatus?: number | null; durationMs?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "OA 连接检测失败");
      setMessage(`连接检测：${result.status}；HTTP ${result.httpStatus ?? "无"}；${result.durationMs ?? 0}ms。`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "OA 连接检测失败"); }
    finally { setWorking(""); }
  }

  if (!isSystemAdmin) return null;
  return <section className="panel oa-connector-panel"><div className="control-head"><div><h2>OA 接入配置</h2><p>仅保存受控连接参数。凭证仅加密保存在服务端；“测试连接”只发起 GET/HEAD 探测，不同步、不导入资料。</p></div><b>管理员专用</b></div>
    <div className="form-grid oa-connector-form"><label><span>OA 名称 *</span><input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label><span>Base URL *</span><input value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://..."/></label><label><span>API Path / Endpoint *</span><input value={form.endpointPath} onChange={event => setForm({ ...form, endpointPath: event.target.value })} placeholder="/health"/></label><label><span>请求方法</span><select value={form.requestMethod} onChange={event => setForm({ ...form, requestMethod: event.target.value as "GET" | "HEAD" })}><option>GET</option><option>HEAD</option></select></label><label><span>Content-Type</span><input value={form.contentType} onChange={event => setForm({ ...form, contentType: event.target.value })}/></label><label><span>认证方式</span><select value={form.authType} onChange={event => setForm({ ...form, authType: event.target.value as OaConnectorRecord["authType"] })}><option value="NONE">NONE</option><option value="BEARER_TOKEN">BEARER_TOKEN</option><option value="API_KEY">API_KEY</option><option value="BASIC_AUTH">BASIC_AUTH</option><option value="CUSTOM_HEADER">CUSTOM_HEADER</option></select></label><label><span>自定义认证 Header 名</span><input value={form.customAuthHeaderName} onChange={event => setForm({ ...form, customAuthHeaderName: event.target.value })} placeholder="仅 CUSTOM_HEADER 使用"/></label><label><span>超时（毫秒）</span><input type="number" min={500} max={120000} value={form.timeoutMs} onChange={event => setForm({ ...form, timeoutMs: Number(event.target.value) || 15000 })}/></label><label><span>非敏感 Header JSON</span><input value={form.headersText} onChange={event => setForm({ ...form, headersText: event.target.value })} placeholder='{"Accept-Language":"zh-CN"}'/></label><label><span>启用测试连接</span><select value={form.enabled ? "yes" : "no"} onChange={event => setForm({ ...form, enabled: event.target.value === "yes" })}><option value="no">停用</option><option value="yes">启用</option></select></label></div>
    <div className="form-grid oa-connector-form"><label><span>Token</span><input type="password" value={form.token} onChange={event => setForm({ ...form, token: event.target.value })}/></label><label><span>AppKey</span><input type="password" value={form.appKey} onChange={event => setForm({ ...form, appKey: event.target.value })}/></label><label><span>AppSecret</span><input type="password" value={form.appSecret} onChange={event => setForm({ ...form, appSecret: event.target.value })}/></label><label><span>API Key</span><input type="password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })}/></label><label><span>Username</span><input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })}/></label><label><span>Password</span><input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label><label><span>自定义 Header 值</span><input type="password" value={form.customHeaderValue} onChange={event => setForm({ ...form, customHeaderValue: event.target.value })}/></label><button disabled={working === "save"} onClick={() => void save()}>{working === "save" ? "正在保存…" : editingId ? "保存修改" : "保存配置"}</button></div>
    {message && <div className="notice admin-notice">{message}</div>}
    <div className="rule-list oa-connector-list"><div><span>名称</span><span>认证</span><span>启用</span><span>凭证</span><span>最后检测</span><span>操作</span></div>{connectors.length === 0 ? <p>尚未配置 OA 连接器。保存配置不会自动同步任何资料。</p> : connectors.map(connector => <article key={connector.id}><span><b>{connector.name}</b><small>{connector.endpointPath}</small></span><span>{connector.authType}</span><span>{connector.enabled ? "已启用" : "已停用"}</span><span>{connector.hasCredentials ? "已保存（不可查看）" : "未设置"}</span><span>{connector.lastCheckStatus ? `${connector.lastCheckStatus} · ${connector.lastCheckDurationMs ?? 0}ms` : "未检测"}</span><span><button onClick={() => edit(connector)}>编辑</button><button disabled={!connector.enabled || working === `test-${connector.id}`} onClick={() => void test(connector.id)}>{working === `test-${connector.id}` ? "检测中…" : "测试连接"}</button></span></article>)}</div>
  </section>;
}

function AccessCenter({ user, refreshSessionAndRecords }: { user: SessionUser | null; refreshSessionAndRecords: () => Promise<void> }) {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState({ name: "", email: "", employeeNo: "", departmentName: "集团办公室", role: "employee", positionLevel: 1, clearanceLevel: 2 });
  const [showLocalTestPanel, setShowLocalTestPanel] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<LocalTestAccountRecord[]>([]);
  const [switchableAccounts, setSwitchableAccounts] = useState<LocalTestAccount[]>([]);
  const [localWorking, setLocalWorking] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const currentLocalAccount = localAccounts.find((accountItem) => accountItem.id === user?.id);

  const loadUsers = useCallback(async () => {
    if (user?.role !== "system_admin") return;
    const response = await fetch("/api/users", { cache: "no-store" });
    const result = await response.json() as { users?: SessionUser[]; error?: string };
    if (response.ok) setUsers(result.users || []); else setMessage(result.error || "读取账号失败");
  }, [user?.role]);
  useEffect(() => { void (async () => { await loadUsers(); })(); }, [loadUsers]);

  useEffect(() => {
    // 说明：浏览器侧只在 Vite development 和回环地址尝试显示面板；
    // 服务端接口仍会再次验证 development + localhost，前端条件不能绕过生产安全边界。
    const panelTimer = window.setTimeout(() => {
      const hostName = window.location.hostname;
      setShowLocalTestPanel(import.meta.env.DEV && ["localhost", "127.0.0.1", "::1"].includes(hostName));
    }, 0);
    return () => window.clearTimeout(panelTimer);
  }, []);

  useEffect(() => {
    if (!showLocalTestPanel || user?.role !== "system_admin") return;
    // 说明：本机管理员读取服务端返回的虚构测试账号和预期资料范围；
    // 非管理员不会得到账号清单，避免前端承担身份授权逻辑。
    void (async () => {
      const response = await fetch("/api/local-test/accounts", { cache: "no-store" });
      const result = await response.json() as { users?: LocalTestAccountRecord[]; switchableAccounts?: LocalTestAccount[]; error?: string };
      if (response.ok) {
        setLocalAccounts(result.users || []);
        setSwitchableAccounts(result.switchableAccounts || []);
      } else {
        setLocalMessage(result.error || "无法读取本机测试账号");
      }
    })();
  }, [showLocalTestPanel, user?.role]);

  async function switchLocalIdentity(accountKey: LocalTestAccount["key"]) {
    setLocalWorking(accountKey); setLocalMessage("");
    try {
      // 说明：前端只传固定账号代号，服务端负责验证管理员身份、白名单和 HttpOnly Cookie。
      const response = await fetch("/api/local-test/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "switch", account: accountKey }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "切换本机测试身份失败");
      await refreshSessionAndRecords();
      setLocalMessage("测试身份已切换，当前会话和资料列表已按服务端权限刷新。");
    } catch (error) { setLocalMessage(error instanceof Error ? error.message : "切换本机测试身份失败"); }
    finally { setLocalWorking(""); }
  }

  async function restoreLocalAdministrator() {
    setLocalWorking("clear"); setLocalMessage("");
    try {
      // 说明：清除本机 HttpOnly Cookie 后，统一认证入口会在 localhost development 下回退到默认管理员。
      const response = await fetch("/api/local-test/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "恢复本机管理员失败");
      await refreshSessionAndRecords();
      setLocalMessage("已清除本机测试身份，当前会话已恢复默认管理员。");
    } catch (error) { setLocalMessage(error instanceof Error ? error.message : "恢复本机管理员失败"); }
    finally { setLocalWorking(""); }
  }

  async function addAccount() {
    if (!account.name.trim() || !account.email.trim()) { setMessage("请填写员工姓名和实际登录邮箱。"); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(account) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "账号配置失败");
      setAccount({ ...account, name: "", email: "", employeeNo: "" }); setAdding(false); setMessage("员工账号已配置。该员工使用相同邮箱登录后，系统会自动应用部门、岗位和数据级别权限。");
      await loadUsers();
    } catch (error) { setMessage(error instanceof Error ? error.message : "账号配置失败"); }
    finally { setSaving(false); }
  }

  const levelRows = [
    ["D1 公开", "公司官网、公开产品、公开政策、公开案例", "所有已启用员工账号", "允许使用真实公开内容"],
    ["D2 内部", "脱敏制度、模板、模拟流程、非敏感内部资料", "本部门员工；公司级资料按授权范围", "试用阶段主数据层"],
    ["D3 敏感", "脱敏后的部门经营样例、虚构合同样例", "部门负责人、集团领导或明确授权人员", "只用模拟或深度脱敏数据"],
    ["D4 机密", "真实财务明细、人事薪酬、客户隐私、未公开合同价格、密钥", "试用平台不开放", "禁止上传"],
  ];
  const roleRows = [
    ["普通员工", "P1", "D1＋本部门D2", "查询、起草、查看本人草稿"],
    ["部门负责人", "P3", "D1＋本部门D2/D3", "部门资料查询；是否审核另行授权"],
    ["集团领导", "P4/P5", "D1＋集团D2＋授权D3", "跨部门查询按分管范围控制"],
    ["资料审核员", "独立角色", "仍受部门和D级限制", "审核其有权查看的资料"],
    ["知识管理员", "独立角色", "仍受数据级别和范围限制", "版本、知识发布、失效处理"],
    ["系统管理员", "技术角色", "不因管理员身份自动获得业务内容", "账号、权限规则和系统配置"],
  ];

  return <section className="page"><PageTitle kicker="账号与数据权限" title="权限中心" text="每次登录后，系统根据账号、部门、岗位级别、数据级别和单独授权共同决定可见范围。"/>
    {user && <div className="panel current-account"><div className="account-avatar">{user.name[0]}</div><div><span>当前登录账号</span><h2>{user.name}</h2><p>{user.email} · {user.departmentName}</p></div><div className="account-tags"><em>{roleLabel(user.role)}</em><em>P{user.positionLevel} 岗位级别</em><em>D{user.clearanceLevel} 数据许可</em></div></div>}
    {showLocalTestPanel && user && <section className="panel local-test-panel"><div className="local-test-head"><div><p>仅本机开发测试</p><h2>本机测试身份</h2><span>不会出现在正式系统。切换后，资料列表会立即按服务端真实权限重新过滤。</span></div><b>LOCAL ONLY</b></div><div className="local-test-current"><strong>当前：{user.name}</strong><span>{roleLabel(user.role)} · {user.departmentName} · P{user.positionLevel} / D{user.clearanceLevel}</span><small>当前预期可见级别：{currentLocalAccount?.readableLevels.join("、") || `D${user.clearanceLevel}，以服务端实际过滤为准`}。</small></div>
      {user.role === "system_admin" ? <div className="local-test-actions">{switchableAccounts.map(item => <button key={item.key} disabled={Boolean(localWorking)} onClick={() => void switchLocalIdentity(item.key)}><strong>{item.name}</strong><span>{item.key} · {item.email}</span></button>)}</div> : <div className="local-test-restore"><span>当前为非管理员测试身份。恢复后可再次切换其他本机账号。</span><button disabled={localWorking === "clear"} onClick={() => void restoreLocalAdministrator()}>{localWorking === "clear" ? "正在恢复…" : "恢复管理员"}</button></div>}
      {user.role === "system_admin" && localAccounts.length > 0 && <div className="local-test-levels">{localAccounts.map(item => <span key={item.id}><b>{item.name}</b><small>可见：{item.readableLevels.join("、") || "无"}</small></span>)}</div>}
      {localMessage && <div className="notice local-test-notice">{localMessage}</div>}
    </section>}
    <div className="access-formula"><Icon name="shield" size={22}/><div><strong>最终可见权限 = 登录账号 ∩ 所属部门 ∩ 岗位级别 ∩ 数据级别 ∩ 文件范围 ∩ 单独授权</strong><span>任一条件不满足，资料列表、正文接口和后续AI检索都会拒绝返回数据。</span></div></div>
    <section className="panel standard-panel"><div className="standard-head"><div><h2>试用数据分级标准</h2><p>先用您公司的脱敏资料验证，不把高风险真实数据带入试用环境。</p></div><b>强制执行</b></div>
      <div className="standard-table"><div><span>级别</span><span>试用内容</span><span>允许账号</span><span>限制</span></div>{levelRows.map(row => <article className={row[0].startsWith("D4") ? "forbidden" : ""} key={row[0]}>{row.map(cell => <span key={cell}>{cell}</span>)}</article>)}</div>
    </section>
    <section className="panel standard-panel"><div className="standard-head"><div><h2>员工级别与默认权限</h2><p>“岗位高”不等于“什么都能看”，系统管理权也不等于业务数据查看权。</p></div></div>
      <div className="role-table"><div><span>账号类型</span><span>岗位级别</span><span>默认数据范围</span><span>可执行操作</span></div>{roleRows.map(row => <article key={row[0]}>{row.map(cell => <span key={cell}>{cell}</span>)}</article>)}</div>
    </section>
    {user?.role === "system_admin" && <section className="panel account-admin"><div className="account-admin-head"><div><h2>试用员工账号</h2><p>必须填写员工实际登录邮箱；系统不允许用户在前端自行选择身份。</p></div><button onClick={() => setAdding(!adding)}>{adding ? "取消" : "＋ 配置账号"}</button></div>
      {message && <div className="notice">{message}</div>}
      {adding && <div className="account-form"><label><span>员工姓名 *</span><input value={account.name} onChange={e => setAccount({...account,name:e.target.value})}/></label><label><span>登录邮箱 *</span><input value={account.email} onChange={e => setAccount({...account,email:e.target.value})}/></label><label><span>员工编号</span><input value={account.employeeNo} onChange={e => setAccount({...account,employeeNo:e.target.value})}/></label><label><span>所属部门</span><select value={account.departmentName} onChange={e => setAccount({...account,departmentName:e.target.value})}><option>集团办公室</option><option>科技与信息化部门</option><option>财务管理部</option><option>运营管理部</option><option>所属子公司</option></select></label><label><span>账号角色</span><select value={account.role} onChange={e => setAccount({...account,role:e.target.value})}><option value="employee">普通员工</option><option value="department_head">部门负责人</option><option value="group_leader">集团领导</option><option value="reviewer">资料审核员</option><option value="knowledge_admin">知识管理员</option><option value="system_admin">系统管理员</option></select></label><label><span>岗位级别</span><select value={account.positionLevel} onChange={e => setAccount({...account,positionLevel:Number(e.target.value)})}>{[1,2,3,4,5].map(x => <option key={x} value={x}>P{x}</option>)}</select></label><label><span>数据许可</span><select value={account.clearanceLevel} onChange={e => setAccount({...account,clearanceLevel:Number(e.target.value)})}><option value={1}>D1 公开</option><option value={2}>D2 内部</option><option value={3}>D3 敏感</option></select></label><button disabled={saving} onClick={() => void addAccount()}>{saving ? "正在配置…" : "保存账号权限"}</button></div>}
      <div className="user-list"><div><span>员工</span><span>部门</span><span>角色</span><span>岗位/许可</span><span>状态</span></div>{users.map(item => <article key={item.id}><span><b>{item.name}</b><small>{item.email}</small></span><span>{item.departmentName}</span><span>{roleLabel(item.role)}</span><span>P{item.positionLevel} / D{item.clearanceLevel}</span><span>已启用</span></article>)}</div>
    </section>}
  </section>;
}

function PanelHead({ icon, title, sub, action, onClick }: { icon:IconName; title:string; sub:string; action?:string; onClick?:()=>void }) {
  return <div className="panel-head"><div><i><Icon name={icon}/></i><span><strong>{title}</strong><small>{sub}</small></span></div>{action && <button onClick={onClick}>{action}<Icon name="arrow" size={14}/></button>}</div>;
}

function PageTitle({ kicker, title, text }: { kicker:string; title:string; text:string }) {
  return <div className="page-title"><p>{kicker}</p><h1>{title}</h1><span>{text}</span></div>;
}
