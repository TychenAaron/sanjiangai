"use client";

import { FormEvent, useMemo, useState } from "react";

type View = "工作台" | "知识问答" | "公文写作" | "政策中心" | "我的资料" | "管理后台";
type IconName = "home" | "chat" | "pen" | "policy" | "folder" | "admin" | "search" | "send" | "shield" | "arrow" | "refresh";

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

const recentDocs = [
  ["请示", "关于推进集团AI知识平台试点的请示", "人工修改中", "今天 10:24"],
  ["汇报", "集团数字化基础设施建设情况汇报", "最终定稿", "8月22日"],
  ["通知", "关于开展OA资料清点工作的通知", "已入知识库", "8月20日"],
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
  const greeting = useMemo(() => new Date().getHours() < 12 ? "上午好" : new Date().getHours() < 18 ? "下午好" : "晚上好", []);

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
          {view === "工作台" && <Dashboard greeting={greeting} query={query} setQuery={setQuery} ask={ask} docType={docType} setDocType={setDocType} go={setView}/>}
          {view === "知识问答" && <Knowledge query={query} setQuery={setQuery} answered={answered} ask={ask}/>}
          {view === "政策中心" && <PolicyCenter/>}
          {view === "公文写作" && <Writing docType={docType} setDocType={setDocType}/>}
          {view === "我的资料" && <Library/>}
          {view === "管理后台" && <Admin/>}
        </div>
      </section>
    </main>
  );
}

function Dashboard({ greeting, query, setQuery, ask, docType, setDocType, go }: {
  greeting: string; query: string; setQuery: (v: string) => void; ask: (e: FormEvent) => void;
  docType: string; setDocType: (v: string) => void; go: (v: View) => void;
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
        <div className="numbers"><div><strong>86</strong><span>OA有效文件</span></div><div><strong>19</strong><span>最终定稿</span></div><div><strong>31</strong><span>外部政策</span></div></div>
        <div className="sync"><span><i/>全部来源同步正常</span><small>今天 09:30</small></div>
      </article>
    </section>

    <section className="panel monitor">
      <PanelHead icon="policy" title="青海政策监测" sub="定期发现政府及厅局最新政策和申报要求" action="查看政策中心" onClick={() => go("政策中心")}/>
      <div className="policy-strip">{policies.slice(0,2).map(p => <button key={p.title}><em>{p.level}</em><span><strong>{p.title}</strong><small>发现时间：{p.date}</small></span><i className={p.state === "待审核" ? "pending" : ""}>{p.state}</i></button>)}</div>
    </section>

    <section className="panel recent">
      <PanelHead icon="folder" title="最近文档" sub="草稿、人工修改稿和最终定稿全程留痕" action="查看全部" onClick={() => go("我的资料")}/>
      {recentDocs.map(d => <button className="recent-row" key={d[1]}><i>{d[0][0]}</i><span><strong>{d[1]}</strong><small>{d[0]} · {d[3]}</small></span><em>{d[2]}</em><b>›</b></button>)}
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

function Library() {
  return <section className="page"><PageTitle kicker="AI独立资料数据库" title="我的资料" text="OA转载、人工上传、AI生成、人工修改和最终定稿分别保存，任何修改均保留版本。"/>
    <div className="data-flow"><div><b>01</b><strong>原始资料层</strong><span>OA原文、政府网页、上传文件</span></div><i>→</i><div><b>02</b><strong>加工与草稿层</strong><span>解析文本、AI草稿、人工修改稿</span></div><i>→</i><div><b>03</b><strong>正式知识层</strong><span>经审核的现行文件和最终定稿</span></div></div>
    <div className="panel library-table"><div className="table-head"><span>文件名称</span><span>来源</span><span>版本</span><span>知识状态</span><span>更新时间</span></div>{recentDocs.map((d,i) => <button key={d[1]}><span><i>{d[0][0]}</i>{d[1]}</span><span>{i===2?"OA同步":"AI公文"}</span><span>V{3-i}.0</span><span>{d[2]}</span><span>{d[3]}</span></button>)}</div>
  </section>;
}

function Admin() {
  return <section className="page"><PageTitle kicker="平台治理" title="管理后台" text="统一管理资料来源、审核发布、用户权限、模型和运行审计。"/>
    <div className="admin-grid">{[
      ["数据来源","OA同步、人工上传、政府官网监测","3个来源正常"],
      ["资料审核","新文件审核、版本确认、失效处理","2项待处理"],
      ["用户与权限","部门、角色、知识库和文件权限","20名试点用户"],
      ["模型管理","DeepSeek、向量模型、重排模型","原型配置"],
      ["公文模板","请示、通知、工作情况汇报","3个现行模板"],
      ["审计日志","查询、生成、导出、同步和配置记录","今日36条"],
      ["业务扩展中心","财务、运营及其他业务模块的接口与权限","已预留"],
    ].map(x => <button className="panel" key={x[0]}><span><strong>{x[0]}</strong><small>{x[1]}</small></span><em>{x[2]}</em><Icon name="arrow" size={17}/></button>)}</div>
  </section>;
}

function PanelHead({ icon, title, sub, action, onClick }: { icon:IconName; title:string; sub:string; action?:string; onClick?:()=>void }) {
  return <div className="panel-head"><div><i><Icon name={icon}/></i><span><strong>{title}</strong><small>{sub}</small></span></div>{action && <button onClick={onClick}>{action}<Icon name="arrow" size={14}/></button>}</div>;
}

function PageTitle({ kicker, title, text }: { kicker:string; title:string; text:string }) {
  return <div className="page-title"><p>{kicker}</p><h1>{title}</h1><span>{text}</span></div>;
}
