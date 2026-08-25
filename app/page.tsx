"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type View = "工作台" | "知识问答" | "公文写作" | "政策中心" | "我的资料" | "管理后台";
type IconName = "home" | "chat" | "pen" | "policy" | "folder" | "admin" | "search" | "send" | "shield" | "arrow" | "refresh";

type DocumentRecord = {
  id: string; title: string; documentType: string; sourceType: string; ownerDepartment: string;
  securityLevel: string; permissionScope: string; lifecycleStatus: string; knowledgeStatus: string;
  currentVersion: number; createdBy: string; createdAt: string; updatedAt: string;
};
type DocumentSummary = { total: number; pending: number; approved: number; draft: number };
type AuditLog = { id: string; action: string; operator: string; detail: string; createdAt: string };

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
  const [answered, setAnswered] = useState(false);
  const [docType, setDocType] = useState("请示");
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [summary, setSummary] = useState<DocumentSummary>({ total: 0, pending: 0, approved: 0, draft: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const greeting = useMemo(() => new Date().getHours() < 12 ? "上午好" : new Date().getHours() < 18 ? "下午好" : "晚上好", []);

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

  useEffect(() => { void refreshRecords(); }, [refreshRecords]);

  function ask(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setAnswered(true);
    setView("知识问答");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><b>三江</b><span><strong>集团AI工作台</strong><small>知识与公文智能助手</small></span></div>
        <nav aria-label="主导航">
          <p>员工应用</p>
          {nav.map(item => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => { setView(item.label); setAnswered(false); }}><Icon name={item.icon}/><span>{item.label}</span></button>)}
          <p className="admin-label">平台管理</p>
          <button className={view === "管理后台" ? "active" : ""} onClick={() => setView("管理后台")}><Icon name="admin"/><span>管理后台</span></button>
        </nav>
        <div className="secure"><Icon name="shield" size={17}/>数据访问受集团权限保护</div>
        <button className="profile"><i>陈</i><span><strong>陈奂</strong><small>项目管理员</small></span><b>›</b></button>
      </aside>

      <section className="main">
        <header><div><span>三江集团</span><b>/</b><strong>{view}</strong></div><aside><em><i/>原型环境</em><button>使用帮助</button></aside></header>
        <div className="content">
          {view === "工作台" && <Dashboard greeting={greeting} query={query} setQuery={setQuery} ask={ask} docType={docType} setDocType={setDocType} go={setView} records={records} summary={summary} dataLoading={dataLoading}/>} 
          {view === "知识问答" && <Knowledge query={query} setQuery={setQuery} answered={answered} ask={ask}/>}
          {view === "政策中心" && <PolicyCenter/>}
          {view === "公文写作" && <Writing docType={docType} setDocType={setDocType}/>}
          {view === "我的资料" && <Library records={records} loading={dataLoading} error={dataError} refresh={refreshRecords}/>} 
          {view === "管理后台" && <Admin records={records} summary={summary} refresh={refreshRecords}/>} 
        </div>
      </section>
    </main>
  );
}

function Dashboard({ greeting, query, setQuery, ask, docType, setDocType, go, records, summary, dataLoading }: {
  greeting: string; query: string; setQuery: (v: string) => void; ask: (e: FormEvent) => void;
  docType: string; setDocType: (v: string) => void; go: (v: View) => void; records: DocumentRecord[]; summary: DocumentSummary; dataLoading: boolean;
}) {
  return <>
    <section className="welcome"><div><p>{greeting}，陈奂</p><h1>今天需要查资料，还是起草一份公文？</h1></div><span>2026年8月24日&nbsp;&nbsp;星期一</span></section>
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

function Knowledge({ query, setQuery, answered, ask }: { query: string; setQuery: (v:string)=>void; answered:boolean; ask:(e:FormEvent)=>void }) {
  return <section className="page">
    <PageTitle kicker="集团知识库" title="知识问答" text="只依据员工有权查看的正式资料回答，并显示来源、版本和原文片段。"/>
    <div className="chat-panel">
      {!answered ? <div className="empty"><i><Icon name="chat" size={30}/></i><h2>您想查询什么？</h2><p>系统会先核验权限，再检索OA文件、最终定稿和已审核政策。</p></div> :
      <div className="conversation"><div className="question">{query}</div><div className="answer"><i>AI</i><div><p>根据当前试点知识库，相关事项应先由承办部门形成申请材料，完成部门负责人审核后，按照事项类别进入相应决策程序。</p><p>涉及重大采购的，应同步完成合规审查并保留完整审批记录。具体金额和流程需以最新制度原文为准。</p><section><strong>引用依据</strong><button>《三江集团采购管理办法（2026版）》第12—16条</button><button>《重大事项决策管理制度》第8条</button></section></div></div></div>}
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function Library({ records, loading, error, refresh }: { records: DocumentRecord[]; loading: boolean; error: string; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ title: "", documentType: "制度文件", sourceType: "人工录入", ownerDepartment: "集团办公室", securityLevel: "内部", permissionScope: "集团本部", content: "" });

  function setField(name: string, value: string) { setForm(previous => ({ ...previous, [name]: value })); }
  async function save(submitMode: "draft" | "pending") {
    if (!form.title.trim() || !form.content.trim()) { setNotice("请先填写文件名称和正文内容。"); return; }
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, submitMode }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "保存失败");
      setForm({ ...form, title: "", content: "" }); setAdding(false);
      setNotice(submitMode === "draft" ? "草稿已保存，系统已生成V1.0版本记录。" : "资料已提交审核，审核通过后才会进入正式知识库。");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  return <section className="page"><PageTitle kicker="AI独立资料数据库" title="我的资料" text="OA转载、人工录入、AI生成、人工修改和最终定稿分别保存，任何修改均保留版本。"/>
    <div className="data-flow"><div><b>01</b><strong>原始资料层</strong><span>OA原文、政府网页、人工录入</span></div><i>→</i><div><b>02</b><strong>加工与草稿层</strong><span>解析文本、AI草稿、人工修改稿</span></div><i>→</i><div><b>03</b><strong>正式知识层</strong><span>经审核的现行文件和最终定稿</span></div></div>
    <div className="library-actions"><div><strong>资料台账</strong><span>共 {records.length} 份真实记录</span></div><button onClick={() => setAdding(!adding)}>{adding ? "取消新增" : "＋ 新增测试资料"}</button></div>
    {notice && <div className="notice">{notice}</div>}
    {adding && <div className="panel ingest-form">
      <div className="form-grid">
        <label><span>文件名称 *</span><input value={form.title} onChange={e => setField("title", e.target.value)} placeholder="例如：集团采购管理办法（试行）"/></label>
        <label><span>文件类型</span><select value={form.documentType} onChange={e => setField("documentType", e.target.value)}><option>制度文件</option><option>通知</option><option>请示</option><option>工作情况汇报</option><option>会议纪要</option><option>政策文件</option><option>其他资料</option></select></label>
        <label><span>数据来源</span><select value={form.sourceType} onChange={e => setField("sourceType", e.target.value)}><option>人工录入</option><option>OA批量导出</option><option>AI生成定稿</option><option>政府官网</option></select></label>
        <label><span>责任部门</span><select value={form.ownerDepartment} onChange={e => setField("ownerDepartment", e.target.value)}><option>集团办公室</option><option>科技与信息化部门</option><option>财务管理部</option><option>运营管理部</option><option>所属子公司</option></select></label>
        <label><span>密级</span><select value={form.securityLevel} onChange={e => setField("securityLevel", e.target.value)}><option>公开</option><option>内部</option><option>敏感</option></select></label>
        <label><span>可查看范围</span><select value={form.permissionScope} onChange={e => setField("permissionScope", e.target.value)}><option>集团全员</option><option>集团本部</option><option>责任部门</option><option>指定人员</option></select></label>
      </div>
      <label className="content-field"><span>正文内容 *</span><textarea value={form.content} onChange={e => setField("content", e.target.value)} placeholder="本关先粘贴一小段脱敏测试正文。后续接入OA批量同步和文件上传。"/></label>
      <div className="form-actions"><small>原文入库后不可直接覆盖；后续修改会生成新版本。</small><button disabled={saving} onClick={() => void save("draft")}>保存草稿</button><button disabled={saving} className="submit" onClick={() => void save("pending")}>{saving ? "正在保存…" : "保存并提交审核"}</button></div>
    </div>}
    {error && <div className="notice error">数据库暂时无法读取：{error}</div>}
    <div className="panel library-table"><div className="table-head"><span>文件名称</span><span>来源</span><span>版本</span><span>知识状态</span><span>更新时间</span></div>
      {loading ? <div className="table-empty">正在读取资料数据库…</div> : records.length === 0 ? <div className="table-empty">数据库已就绪。请新增一份脱敏测试资料。</div> : records.map(d => <button key={d.id}><span><i>{d.documentType[0]}</i><span><b>{d.title}</b><small>{d.ownerDepartment} · {d.securityLevel} · {d.permissionScope}</small></span></span><span>{d.sourceType}</span><span>V{d.currentVersion}.0</span><span><em className={`record-status ${d.knowledgeStatus}`}>{statusLabel(d.knowledgeStatus)}</em></span><span>{formatDate(d.updatedAt)}</span></button>)}
    </div>
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
  useEffect(() => { void loadLogs(); }, [loadLogs, records.length]);

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
      ["模型管理","DeepSeek、向量模型、重排模型","第三关接入"],
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

function PanelHead({ icon, title, sub, action, onClick }: { icon:IconName; title:string; sub:string; action?:string; onClick?:()=>void }) {
  return <div className="panel-head"><div><i><Icon name={icon}/></i><span><strong>{title}</strong><small>{sub}</small></span></div>{action && <button onClick={onClick}>{action}<Icon name="arrow" size={14}/></button>}</div>;
}

function PageTitle({ kicker, title, text }: { kicker:string; title:string; text:string }) {
  return <div className="page-title"><p>{kicker}</p><h1>{title}</h1><span>{text}</span></div>;
}
