"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type View = "工作台" | "知识问答" | "公文写作" | "政策中心" | "我的资料" | "权限中心" | "管理后台";
type IconName = "home" | "chat" | "pen" | "policy" | "folder" | "admin" | "search" | "send" | "shield" | "arrow" | "refresh";

type DocumentRecord = {
  id: string; title: string; documentType: string; sourceType: string; ownerDepartment: string;
  securityLevel: string; permissionScope: string; lifecycleStatus: string; knowledgeStatus: string;
  trialDataClass: string; isTrialData: boolean; fileName: string | null; parseStatus: string; indexStatus: string;
  currentVersion: number; createdBy: string; createdByUserId: string | null; createdAt: string; updatedAt: string;
};
type DocumentSummary = { total: number; pending: number; approved: number; draft: number };
type AuditLog = { id: string; action: string; operator: string; detail: string; createdAt: string };
type DocumentVersion = { id: string; versionNo: number; content: string; changeSummary: string; versionStatus: string; createdBy: string; createdAt: string };
type SessionUser = { id: string; name: string; email: string; employeeNo: string | null; departmentName: string; role: string; positionLevel: number; clearanceLevel: number; status: string };
type KnowledgeResult = {
  answer: string;
  mode: "qwen" | "extractive" | "no_basis";
  model: string;
  citations: Array<{ documentId: string; title: string; version: number; excerpt: string; sourceType: string; score: number }>;
};

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
  { label: "知识问答", icon: "chat" },
  { label: "公文写作", icon: "pen" },
  { label: "政策中心", icon: "policy" },
  { label: "我的资料", icon: "folder" },
];

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
  const [askError, setAskError] = useState("");
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

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/session", { cache: "no-store" });
      const result = await response.json() as { user?: SessionUser; error?: string };
      if (response.ok && result.user) { setCurrentUser(result.user); setSessionError(""); await refreshRecords(); }
      else { setSessionError(result.error || "无法识别登录账号"); setDataLoading(false); }
    })();
  }, [refreshRecords]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = query.trim();
    if (!question || asking) return;
    setView("知识问答");
    setLastQuestion(question); setKnowledgeResult(null); setAskError(""); setAsking(true);
    try {
      const response = await fetch("/api/knowledge/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: question }) });
      const result = await response.json() as KnowledgeResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "知识检索失败");
      setKnowledgeResult(result);
    } catch (error) { setAskError(error instanceof Error ? error.message : "知识检索失败"); }
    finally { setAsking(false); }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><b>三江</b><span><strong>集团AI工作台</strong><small>知识与公文智能助手</small></span></div>
        <nav aria-label="主导航">
          <p>员工应用</p>
          {nav.map(item => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => setView(item.label)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
          <p className="admin-label">平台管理</p>
          <button className={view === "权限中心" ? "active" : ""} onClick={() => setView("权限中心")}><Icon name="shield"/><span>权限中心</span></button>
          {canOpenAdmin && <button className={view === "管理后台" ? "active" : ""} onClick={() => setView("管理后台")}><Icon name="admin"/><span>管理后台</span></button>}
        </nav>
        <div className="secure"><Icon name="shield" size={17}/>数据访问受集团权限保护</div>
        <button className="profile" onClick={() => setView("权限中心")}><i>{currentUser?.name?.[0] || "员"}</i><span><strong>{currentUser?.name || "正在识别账号"}</strong><small>{currentUser ? `${roleLabel(currentUser.role)} · ${currentUser.departmentName}` : "登录账号校验中"}</small></span><b>›</b></button>
      </aside>

      <section className="main">
        <header><div><span>三江集团</span><b>/</b><strong>{view}</strong></div><aside>{currentUser && <span className="identity-chip">D{currentUser.clearanceLevel} · P{currentUser.positionLevel}</span>}<em><i/>权限试用环境</em><button>使用帮助</button></aside></header>
        <div className="content">
          {sessionError && <div className="access-blocked"><Icon name="shield" size={30}/><h2>当前账号暂不能进入资料库</h2><p>{sessionError}</p><span>请由系统管理员在“权限中心”按登录邮箱配置员工级别、部门和数据权限。</span></div>}
          {!sessionError && view === "工作台" && <Dashboard greeting={greeting} userName={currentUser?.name || "员工"} query={query} setQuery={setQuery} ask={ask} docType={docType} setDocType={setDocType} go={setView} records={records} summary={summary} dataLoading={dataLoading}/>} 
          {!sessionError && view === "知识问答" && <Knowledge query={query} setQuery={setQuery} lastQuestion={lastQuestion} result={knowledgeResult} asking={asking} error={askError} ask={ask}/>} 
          {!sessionError && view === "政策中心" && <PolicyCenter/>}
          {!sessionError && view === "公文写作" && <Writing docType={docType} setDocType={setDocType}/>} 
          {!sessionError && view === "我的资料" && <Library user={currentUser} records={records} loading={dataLoading} error={dataError} refresh={refreshRecords}/>} 
          {!sessionError && view === "权限中心" && <AccessCenter user={currentUser}/>} 
          {!sessionError && view === "管理后台" && canOpenAdmin && <Admin records={records} summary={summary} refresh={refreshRecords}/>} 
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
    <section className="welcome"><div><p>{greeting}，{userName}</p><h1>今天需要查资料，还是起草一份公文？</h1></div><span>账号权限已在服务端生效</span></section>
    <form className="ask-card" onSubmit={ask}>
      <div className="card-title"><i>AI</i><strong>向集团知识库提问</strong><span>回答将标注来源文件、版本和原文片段</span></div>
      <label className="ask-input"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="例如：集团现行采购制度中，单笔50万元以上项目如何审批？"/><button aria-label="发送问题"><Icon name="send" size={18}/></button></label>
      <div className="quick"><span>常用问题</span>{["集团采购审批要求","查找青稞项目会议纪要","公文用印流程"].map(q => <button type="button" onClick={() => setQuery(q)} key={q}>{q}</button>)}</div>
    </form>

    <section className="module-grid">
      <article className="panel writing">
        <PanelHead icon="pen" title="公文写作" sub="基于集团模板和现行制度辅助起草" action="进入写作" onClick={() => go("公文写作")}/>
        <div className="doc-types">{["请示","通知","工作情况汇报"].map(t => <button className={docType === t ? "selected" : ""} onClick={() => setDocType(t)} key={t}><i>{t[0]}</i><span><strong>{t}</strong><small>{t === "请示" ? "事项报批、项目申请" : t === "通知" ? "工作安排、事项告知" : "阶段总结、进展汇报"}</small></span></button>)}</div>
        <button className="new-doc" onClick={() => go("公文写作")}>＋ 新建{docType}</button>
      </article>
      <article className="panel sources">
        <PanelHead icon="folder" title="AI资料库" sub="平台独立数据库"/>
        <div className="numbers"><div><strong>{dataLoading ? "—" : summary.total}</strong><span>全部资料</span></div><div><strong>{dataLoading ? "—" : summary.approved}</strong><span>正式知识</span></div><div><strong>{dataLoading ? "—" : summary.pending}</strong><span>待审核</span></div></div>
        <div className="sync"><span><i/>数据库连接正常</span><small>实时读取</small></div>
      </article>
    </section>

    <section className="panel monitor">
      <PanelHead icon="policy" title="青海政策监测" sub="定期发现政府及厅局最新政策和申报要求" action="查看政策中心" onClick={() => go("政策中心")}/>
      <div className="policy-strip">{policies.slice(0,2).map(p => <button key={p.title}><em>{p.level}</em><span><strong>{p.title}</strong><small>发现时间：{p.date}</small></span><i className={p.state === "待审核" ? "pending" : ""}>{p.state}</i></button>)}</div>
    </section>

    <section className="panel recent">
      <PanelHead icon="folder" title="最近文档" sub="草稿、人工修改稿和最终定稿全程留痕" action="查看全部" onClick={() => go("我的资料")}/>
      {records.length === 0 ? <div className="no-records">尚无真实资料，进入“我的资料”添加第一份测试文件。</div> : records.slice(0,3).map(d => <button className="recent-row" key={d.id} onClick={() => go("我的资料")}><i>{d.documentType[0]}</i><span><strong>{d.title}</strong><small>{d.sourceType} · {formatDate(d.updatedAt)}</small></span><em>{statusLabel(d.knowledgeStatus)}</em><b>›</b></button>)}
    </section>

    <section className="panel extensions">
      <PanelHead icon="admin" title="扩展能力中心" sub="统一平台预留财务、运营和其他业务模块接口"/>
      <div>{[["财务经营","预算执行、经营指标和领导查询"],["运营分析","项目进度、任务督办和运营周报"],["业务系统","NC、ERP及后续集团业务系统"]].map(x => <button key={x[0]}><i>待接入</i><strong>{x[0]}</strong><span>{x[1]}</span></button>)}</div>
    </section>
  </>;
}

function Knowledge({ query, setQuery, lastQuestion, result, asking, error, ask }: {
  query: string; setQuery: (v:string)=>void; lastQuestion: string; result: KnowledgeResult | null; asking: boolean; error: string; ask:(e:FormEvent)=>void;
}) {
  return <section className="page">
    <PageTitle kicker="集团知识库" title="知识问答" text="只依据员工有权查看的正式资料回答，并显示来源、版本和原文片段。"/>
    <div className="retrieval-status"><span><i/>权限检索已启用</span><span><i/>全文检索已启用</span><span className="waiting"><i/>Qwen3.8-27B等待云端地址</span></div>
    <div className="chat-panel">
      {!lastQuestion && !asking ? <div className="empty"><i><Icon name="chat" size={30}/></i><h2>您想查询什么？</h2><p>请先上传并审核一份脱敏资料。系统会先核验账号权限，再检索正式知识。</p></div> :
      <div className="conversation"><div className="question">{lastQuestion}</div>
        {asking && <div className="answer loading-answer"><i>AI</i><div><p>正在进行账号权限过滤和资料检索……</p></div></div>}
        {error && <div className="answer"><i>!</i><div><p>{error}</p></div></div>}
        {result && <div className="answer"><i>AI</i><div><div className={`answer-mode ${result.mode}`}>{result.mode === "qwen" ? `${result.model}生成` : result.mode === "extractive" ? "原文检索模式" : "无可靠依据"}</div>{result.answer.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {result.citations.length > 0 && <section><strong>引用依据（均已通过当前账号权限校验）</strong>{result.citations.map((citation, index) => <article className="citation" key={`${citation.documentId}-${index}`}><button>[{index + 1}]《{citation.title}》V{citation.version}.0 · {citation.sourceType}</button><p>{citation.excerpt}</p></article>)}</section>}</div></div>}
      </div>}
      <form className="chat-input" onSubmit={ask}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入问题，按回车发送"/><button aria-label="发送"><Icon name="send"/></button></form>
    </div>
  </section>;
}

function PolicyCenter() {
  const [filter, setFilter] = useState("全部政策");
  return <section className="page">
    <PageTitle kicker="外部政策情报" title="青海政策监测中心" text="定期检查青海省政府及相关厅局官网。系统负责发现和比对，管理员审核后才进入正式知识库。"/>
    <div className="policy-toolbar"><div>{["全部政策","待审核","已收录","已更新"].map(x => <button className={filter === x ? "active" : ""} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div><button className="scan"><Icon name="refresh" size={16}/>立即检查官网</button></div>
    <div className="policy-layout">
      <div className="panel policy-list">{policies.filter(p => filter === "全部政策" || p.state === filter).map(p => <article key={p.title}><span className="gov-icon">政</span><div><div><em>{p.level}</em>{p.fresh && <b>新发现</b>}</div><h3>{p.title}</h3><p>发布日期：{p.date}　来源：青海省官方政府网站　已保存原始链接和网页快照</p></div><aside><i className={p.state === "待审核" ? "pending" : ""}>{p.state}</i><button>查看详情</button></aside></article>)}</div>
      <aside className="panel watch-sites"><h3>监测网站</h3><p>仅采集经批准的政府官方网站</p>{["青海省人民政府","青海省科学技术厅","青海省农业农村厅","青海省工业和信息化厅","青海省发展改革委"].map((s,i) => <div key={s}><i/ ><span>{s}</span><em>{i < 3 ? "今日已检查" : "等待检查"}</em></div>)}</aside>
    </div>
  </section>;
}

function Writing({ docType, setDocType }: { docType:string; setDocType:(v:string)=>void }) {
  return <section className="page">
    <PageTitle kicker="公文智能体" title="新建公文" text="AI先根据事实信息和集团资料生成提纲，人工确认后再生成正文。"/>
    <div className="panel writing-form"><div className="steps"><b>1</b><span>选择文种</span><i/><b>2</b><span>填写事实</span><i/><b>3</b><span>确认提纲</span><i/><b>4</b><span>生成正文</span></div>
      <h3>选择公文类型</h3><div className="large-types">{["请示","通知","工作情况汇报"].map(t => <button className={docType===t?"active":""} onClick={()=>setDocType(t)} key={t}><i>{t[0]}</i><strong>{t}</strong><small>{t==="请示"?"事项报批、资金申请和项目立项":t==="通知"?"部署工作、告知事项和会议安排":"阶段进展、专项工作和领导汇报"}</small></button>)}</div>
      <button className="primary">下一步：填写事实信息 <Icon name="arrow" size={16}/></button>
    </div>
  </section>;
}

function statusLabel(status: string) {
  return status === "approved" ? "已入正式知识库" : status === "pending" ? "待审核" : status === "rejected" ? "已退回" : "草稿";
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
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [versionContent, setVersionContent] = useState("");
  const [changeSummary, setChangeSummary] = useState("人工修改");
  const [versionEditor, setVersionEditor] = useState(false);
  const [form, setForm] = useState({ title: "", documentType: "制度文件", sourceType: "人工录入", ownerDepartment: user?.departmentName || "集团办公室", securityLevel: "内部", permissionScope: "责任部门", trialDataClass: "T2-内部脱敏测试", content: "", confirmedDesensitized: false });

  function setField(name: string, value: string) { setForm(previous => ({ ...previous, [name]: value })); }
  async function save(submitMode: "draft" | "pending") {
    if (ingestMode === "file") { await saveUpload(); return; }
    if (!form.title.trim() || !form.content.trim()) { setNotice("请先填写文件名称和正文内容。"); return; }
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, submitMode }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "保存失败");
      setForm({ ...form, title: "", content: "", confirmedDesensitized: false }); setAdding(false);
      setNotice(submitMode === "draft" ? "草稿已保存，系统已生成V1.0版本记录。" : "资料已提交审核，审核通过后才会进入正式知识库。");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function saveUpload() {
    if (!uploadFile) { setNotice("请先选择一个脱敏文件。"); return; }
    if (!form.title.trim()) { setNotice("请填写文件名称。"); return; }
    if (!form.confirmedDesensitized) { setNotice("请先勾选脱敏确认。"); return; }
    setSaving(true); setNotice("");
    try {
      const payload = new FormData();
      payload.set("file", uploadFile); payload.set("title", form.title); payload.set("documentType", form.documentType);
      payload.set("ownerDepartment", form.ownerDepartment); payload.set("securityLevel", form.securityLevel);
      payload.set("permissionScope", form.permissionScope); payload.set("trialDataClass", form.trialDataClass); payload.set("confirmedDesensitized", "true");
      const response = await fetch("/api/documents/upload", { method: "POST", body: payload });
      const result = await response.json() as { error?: string; chunkCount?: number };
      if (!response.ok) throw new Error(result.error || "上传失败");
      setUploadFile(null); setForm({ ...form, title: "", content: "", confirmedDesensitized: false }); setAdding(false);
      setNotice(`文件已经保存并解析为${result.chunkCount || 0}个检索片段，审核通过后即可用于知识问答。`);
      await refresh();
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

  async function saveVersion() {
    if (!selected || !versionContent.trim()) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/documents/${selected.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: versionContent, changeSummary }) });
      const result = await response.json() as { error?: string; version?: number };
      if (!response.ok) throw new Error(result.error || "创建新版本失败");
      setVersionEditor(false); await refresh();
      await openRecord({ ...selected, currentVersion: result.version || selected.currentVersion + 1, knowledgeStatus: "pending" });
      setNotice(`V${result.version}.0已生成并提交审核，旧版本仍完整保留。`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "创建新版本失败"); }
    finally { setSaving(false); }
  }

  return <section className="page"><PageTitle kicker="AI独立资料数据库" title="我的资料" text="OA转载、人工录入、AI生成、人工修改和最终定稿分别保存，任何修改均保留版本。"/>
    <div className="data-flow"><div><b>01</b><strong>原始资料层</strong><span>OA原文、政府网页、人工录入</span></div><i>→</i><div><b>02</b><strong>加工与草稿层</strong><span>解析文本、AI草稿、人工修改稿</span></div><i>→</i><div><b>03</b><strong>正式知识层</strong><span>经审核的现行文件和最终定稿</span></div></div>
    <div className="library-actions"><div><strong>资料台账</strong><span>共 {records.length} 份真实记录</span></div><button onClick={() => setAdding(!adding)}>{adding ? "取消新增" : "＋ 新增测试资料"}</button></div>
    {notice && <div className="notice">{notice}</div>}
    {adding && <div className="panel ingest-form">
      <div className="trial-rule"><Icon name="shield" size={18}/><div><strong>当前为试用数据入口</strong><span>只允许公开资料、内部脱敏测试资料和部门隔离测试资料；真实敏感资料与禁止项不得上传。</span></div></div>
      <div className="ingest-mode"><button className={ingestMode === "file" ? "active" : ""} onClick={() => setIngestMode("file")}>上传文件</button><button className={ingestMode === "text" ? "active" : ""} onClick={() => setIngestMode("text")}>粘贴正文</button><span>{ingestMode === "file" ? "本关支持Word（.docx）、TXT和Markdown，PDF/扫描件将在OCR关接入。" : "适合快速粘贴一小段脱敏制度进行测试。"}</span></div>
      {ingestMode === "file" && <label className="file-drop"><input type="file" accept=".docx,.txt,.md" onChange={event => { const file = event.target.files?.[0] || null; setUploadFile(file); if (file && !form.title) setField("title", file.name.replace(/\.[^.]+$/, "")); }}/><Icon name="folder" size={24}/><span><strong>{uploadFile ? uploadFile.name : "选择脱敏文件"}</strong><small>{uploadFile ? `${(uploadFile.size / 1024).toFixed(1)} KB` : "单个文件不超过8MB"}</small></span></label>}
      <div className="form-grid">
        <label><span>文件名称 *</span><input value={form.title} onChange={e => setField("title", e.target.value)} placeholder="例如：集团采购管理办法（试行）"/></label>
        <label><span>试用数据类别 *</span><select value={form.trialDataClass} onChange={e => { const value = e.target.value; setField("trialDataClass", value); if (value === "T1-公开资料") { setField("securityLevel", "公开"); setField("permissionScope", "公司全员"); } if (value === "T3-部门隔离测试") setField("permissionScope", "责任部门"); }}><option>T1-公开资料</option><option>T2-内部脱敏测试</option><option>T3-部门隔离测试</option></select></label>
        <label><span>文件类型</span><select value={form.documentType} onChange={e => setField("documentType", e.target.value)}><option>制度文件</option><option>通知</option><option>请示</option><option>工作情况汇报</option><option>会议纪要</option><option>政策文件</option><option>其他资料</option></select></label>
        <label><span>数据来源</span><select disabled={ingestMode === "file"} value={ingestMode === "file" ? "文件上传" : form.sourceType} onChange={e => setField("sourceType", e.target.value)}><option>文件上传</option><option>人工录入</option><option>OA批量导出</option><option>AI生成定稿</option><option>政府官网</option></select></label>
        <label><span>责任部门</span><select value={form.ownerDepartment} onChange={e => setField("ownerDepartment", e.target.value)}><option>集团办公室</option><option>科技与信息化部门</option><option>财务管理部</option><option>运营管理部</option><option>所属子公司</option></select></label>
        <label><span>数据级别</span><select disabled={form.trialDataClass === "T1-公开资料"} value={form.securityLevel} onChange={e => setField("securityLevel", e.target.value)}><option>公开</option><option>内部</option>{(user?.clearanceLevel || 0) >= 3 && <option>敏感</option>}</select></label>
        <label><span>可查看范围</span><select disabled={form.trialDataClass === "T1-公开资料" || form.trialDataClass === "T3-部门隔离测试"} value={form.permissionScope} onChange={e => setField("permissionScope", e.target.value)}><option>公司全员</option><option>集团本部</option><option>责任部门</option><option>领导班子</option><option>指定人员</option></select></label>
      </div>
      {ingestMode === "text" && <label className="content-field"><span>正文内容 *</span><textarea value={form.content} onChange={e => setField("content", e.target.value)} placeholder="粘贴一小段脱敏测试正文。系统会自动切分成可检索片段。"/></label>}
      <label className="confirm-check"><input type="checkbox" checked={form.confirmedDesensitized} onChange={e => setForm(previous => ({ ...previous, confirmedDesensitized: e.target.checked }))}/><span>我确认该资料已经脱敏，不含真实财务明细、员工隐私、客户个人信息、账号密码、密钥、未公开合同价格及涉密内容。</span></label>
      <div className="form-actions"><small>系统将登录账号、部门、员工级别、数据级别和查看范围共同用于权限判断。</small>{ingestMode === "text" && <button disabled={saving} onClick={() => void save("draft")}>保存草稿</button>}<button disabled={saving} className="submit" onClick={() => void save("pending")}>{saving ? "正在处理…" : ingestMode === "file" ? "上传、解析并提交审核" : "保存并提交审核"}</button></div>
    </div>}
    {error && <div className="notice error">数据库暂时无法读取：{error}</div>}
    <div className="panel library-table"><div className="table-head"><span>文件名称</span><span>来源</span><span>版本</span><span>知识状态</span><span>更新时间</span></div>
      {loading ? <div className="table-empty">正在读取资料数据库…</div> : records.length === 0 ? <div className="table-empty">当前登录账号没有可见资料，或数据库中尚无资料。</div> : records.map(d => <button className={selected?.id === d.id ? "selected-row" : ""} onClick={() => void openRecord(d)} key={d.id}><span><i>{d.documentType[0]}</i><span><b>{d.title}</b><small>{d.trialDataClass} · {d.ownerDepartment} · {d.securityLevel} · {d.permissionScope}</small></span></span><span>{d.sourceType}</span><span>V{d.currentVersion}.0</span><span><em className={`record-status ${d.knowledgeStatus}`}>{statusLabel(d.knowledgeStatus)}</em></span><span>{formatDate(d.updatedAt)}</span></button>)}
    </div>
    {selected && <section className="panel version-panel"><div className="version-head"><div><strong>{selected.title}</strong><span>版本链 · 原始内容不覆盖</span></div><button onClick={() => { setVersionEditor(!versionEditor); setVersionContent(versions[0]?.content || ""); }}>{versionEditor ? "取消修改" : "＋ 创建新版本"}</button></div>
      {versionEditor && <div className="version-editor"><label><span>修改说明</span><input value={changeSummary} onChange={e => setChangeSummary(e.target.value)} placeholder="例如：根据2026年第3次办公会意见修订"/></label><label><span>新版本正文</span><textarea value={versionContent} onChange={e => setVersionContent(e.target.value)}/></label><button disabled={saving} onClick={() => void saveVersion()}>{saving ? "正在生成…" : "生成新版本并提交审核"}</button></div>}
      <div className="version-list">{versions.map(version => <article key={version.id}><b>V{version.versionNo}.0</b><div><strong>{version.changeSummary}</strong><span>{version.createdBy} · {formatDate(version.createdAt)}</span></div><em className={`record-status ${version.versionStatus}`}>{statusLabel(version.versionStatus)}</em></article>)}</div>
    </section>}
  </section>;
}

function Admin({ records, summary, refresh }: { records: DocumentRecord[]; summary: DocumentSummary; refresh: () => Promise<void> }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const pending = records.filter(item => item.knowledgeStatus === "pending");

  const loadLogs = useCallback(async () => {
    const response = await fetch("/api/audit", { cache: "no-store" });
    if (response.ok) { const data = await response.json() as { logs?: AuditLog[] }; setLogs(data.logs || []); }
  }, []);
  useEffect(() => { void (async () => { await loadLogs(); })(); }, [loadLogs, records.length]);

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

  return <section className="page"><PageTitle kicker="平台治理" title="管理后台" text="统一管理资料来源、审核发布、用户权限、模型和运行审计。"/>
    <div className="admin-grid">{[
      ["数据来源","OA同步、人工录入、政府官网监测",`${summary.total}份资料`],
      ["资料审核","新文件审核、版本确认、失效处理",`${summary.pending}项待处理`],
      ["用户与权限","部门、角色、知识库和文件权限","数据表已建立"],
      ["模型管理","Qwen3.8-27B＋Embedding＋Reranker＋OCR","模型网关已预留"],
      ["公文模板","请示、通知、工作情况汇报","3个现行模板"],
      ["审计日志","入库、审核、同步和配置记录",`${logs.length}条记录`],
      ["业务扩展中心","财务、运营及其他业务模块的接口与权限","已预留"],
    ].map(x => <button className="panel" key={x[0]}><span><strong>{x[0]}</strong><small>{x[1]}</small></span><em>{x[2]}</em><Icon name="arrow" size={17}/></button>)}</div>
    {message && <div className="notice admin-notice">{message}</div>}
    <div className="governance-grid">
      <section className="panel review-panel"><h2>资料审核队列 <em>{pending.length}</em></h2><p>只有审核通过的版本才能进入正式知识库，供后续AI检索引用。</p>
        {pending.length === 0 ? <div className="queue-empty">暂无待审核资料</div> : pending.map(item => <article key={item.id}><div><strong>{item.title}</strong><span>{item.documentType} · {item.sourceType} · {item.permissionScope} · V{item.currentVersion}.0</span></div><button disabled={working === item.id} onClick={() => void review(item.id, "reject")}>退回</button><button disabled={working === item.id} className="approve" onClick={() => void review(item.id, "approve")}>审核通过</button></article>)}
      </section>
      <section className="panel audit-panel"><h2>最近审计记录</h2><p>关键操作自动记录操作人、对象和时间。</p>{logs.length === 0 ? <div className="queue-empty">暂无操作记录</div> : logs.slice(0,8).map(log => <article key={log.id}><i/><div><strong>{log.action} · {log.operator}</strong><span>{log.detail}</span><small>{formatDate(log.createdAt)}</small></div></article>)}</section>
    </div>
  </section>;
}

function AccessCenter({ user }: { user: SessionUser | null }) {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState({ name: "", email: "", employeeNo: "", departmentName: "集团办公室", role: "employee", positionLevel: 1, clearanceLevel: 2 });

  const loadUsers = useCallback(async () => {
    if (user?.role !== "system_admin") return;
    const response = await fetch("/api/users", { cache: "no-store" });
    const result = await response.json() as { users?: SessionUser[]; error?: string };
    if (response.ok) setUsers(result.users || []); else setMessage(result.error || "读取账号失败");
  }, [user?.role]);
  useEffect(() => { void (async () => { await loadUsers(); })(); }, [loadUsers]);

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
