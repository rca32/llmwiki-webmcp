'use client';

import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { SiteTools } from './site-tools';

type Page={id:string;title:string;page_type:string;markdown:string;version:number;path:string;updated_at:string};
type Revision={version:number;change_summary:string|null;actor_email:string;origin:string;created_at:string};
type Caps={can_bootstrap:boolean;can_read:boolean;can_write:boolean};
type Envelope<T>={ok:true;data:T;change_set:unknown}|{ok:false;error:{code:string;message:string;details:Record<string,unknown>}};

const welcomeMarkdown=`# WebMCP Native Wiki

사람과 에이전트가 **같은 지식 공간**을 함께 편집합니다.

## 오늘의 초점

- UI와 WebMCP는 같은 서버 명령을 사용합니다.
- 모든 쓰기는 \`expected_version\`으로 충돌을 감지합니다.
- 확정된 변경은 리비전으로 남고 언제든 복구할 수 있습니다.

> 이 페이지는 열린 브라우저 세션의 권한을 그대로 사용합니다.

관련 문서: [[아키텍처]] · [[도구 계약]] · [[운영과 복구]]`;

async function api<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{...init,credentials:'same-origin'});const envelope=await response.json() as Envelope<T>;if(!response.ok||!envelope.ok)throw envelope.ok?new Error(`Request failed (${response.status})`):Object.assign(new Error(envelope.error.message),{code:envelope.error.code,details:envelope.error.details});return envelope.data;}

function MarkdownPreview({value}:{value:string}){return <div className="markdown-preview">{value.split('\n').map((line,index)=>{if(line.startsWith('# '))return <h1 key={index}>{line.slice(2)}</h1>;if(line.startsWith('## '))return <h2 key={index}>{line.slice(3)}</h2>;if(line.startsWith('- '))return <p className="list-row" key={index}><span>—</span>{line.slice(2)}</p>;if(line.startsWith('> '))return <blockquote key={index}>{line.slice(2)}</blockquote>;if(!line)return <div className="spacer" key={index}/>;const parts=line.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`)/g);return <p key={index}>{parts.map((part,i)=>part.startsWith('[[')?<button className="wiki-link" key={i}>{part.slice(2,-2)}</button>:part.startsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part.startsWith('`')?<code key={i}>{part.slice(1,-1)}</code>:part)}</p>;})}</div>}

export default function Home(){
  const [mode,setMode]=useState<'edit'|'preview'>('edit'); const [pages,setPages]=useState<Page[]>([]); const [active,setActive]=useState<Page|null>(null); const [markdown,setMarkdown]=useState(''); const [savedMarkdown,setSavedMarkdown]=useState(''); const [revisions,setRevisions]=useState<Revision[]>([]); const [query,setQuery]=useState(''); const [status,setStatus]=useState('연결 중…'); const [caps,setCaps]=useState<Caps>({can_bootstrap:false,can_read:false,can_write:false}); const [notice,setNotice]=useState<string|null>(null); const activeRef=useRef<Page|null>(null); const dirtyRef=useRef(false);
  const dirty=markdown!==savedMarkdown;
  useEffect(()=>{dirtyRef.current=dirty;activeRef.current=active;},[dirty,active]);

  const openPage=useCallback(async(pageId:string)=>{const [{page},{revisions:history}]=await Promise.all([api<{page:Page}>(`/api/pages/${pageId}`),api<{revisions:Revision[]}>(`/api/pages/${pageId}/revisions?limit=10`)]);setActive(page);setMarkdown(page.markdown);setSavedMarkdown(page.markdown);setRevisions(history);setStatus('동기화됨');setNotice(null);},[]);

  const loadWorkspace=useCallback(async(refreshActive=true)=>{try{let session=await api<{wiki:{id:string;title:string;role:string}|null;capabilities:Caps;site_version:number}>('/api/session/capabilities');if(session.capabilities.can_bootstrap){await api('/api/wikis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Liminal Wiki',expected_version:session.site_version})});session=await api('/api/session/capabilities');}setCaps(session.capabilities);if(!session.capabilities.can_read){setStatus('읽기 권한 없음');return;}let list=(await api<{pages:Page[]}>('/api/pages?limit=100')).pages;if(!list.length&&session.capabilities.can_write){await api('/api/pages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'WebMCP Native Wiki',page_type:'concept',markdown:welcomeMarkdown,parent_id:null,operation_id:crypto.randomUUID()})});list=(await api<{pages:Page[]}>('/api/pages?limit=100')).pages;}setPages(list);const current=activeRef.current;if(refreshActive&&!dirtyRef.current){const target=current&&list.some((page)=>page.id===current.id)?current.id:list[0]?.id;if(target)await openPage(target);}else setStatus('목록 갱신됨');}catch(error){setStatus('연결 실패');setNotice(error instanceof Error?error.message:'위키를 불러오지 못했습니다.');}},[openPage]);

  useEffect(()=>{const initial=window.setTimeout(()=>void loadWorkspace(),0);const onChange=()=>void loadWorkspace(true);const onFocus=()=>void loadWorkspace(true);const poll=window.setInterval(()=>{if(document.visibilityState==='visible')void loadWorkspace(true);},15_000);window.addEventListener('wiki:changed',onChange);window.addEventListener('focus',onFocus);return()=>{window.clearTimeout(initial);window.clearInterval(poll);window.removeEventListener('wiki:changed',onChange);window.removeEventListener('focus',onFocus);};},[loadWorkspace]);
  useEffect(()=>{if(active)document.documentElement.dataset.pageId=active.id;else delete document.documentElement.dataset.pageId;},[active]);

  const filtered=useMemo(()=>pages.filter((page)=>page.title.toLowerCase().includes(query.toLowerCase())),[pages,query]);

  async function save(){if(!active||!dirty||!caps.can_write)return;setStatus('저장 중…');setNotice(null);try{const result=await api<{page_id:string;version:number}>(`/api/pages/${active.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({expected_version:active.version,markdown,change_summary:'UI에서 문서 편집',operation_id:crypto.randomUUID()})});setActive({...active,markdown,version:result.version});setSavedMarkdown(markdown);setStatus('방금 저장됨');setRevisions((await api<{revisions:Revision[]}>(`/api/pages/${active.id}/revisions?limit=10`)).revisions);}catch(error){setStatus('저장 중단');if(error instanceof Error&&(error as Error&{code?:string}).code==='version_conflict')setNotice('다른 변경이 먼저 저장되었습니다. 내 초안은 유지했습니다. 최신 버전을 새로 읽은 뒤 병합해 주세요.');else setNotice(error instanceof Error?error.message:'저장하지 못했습니다.');}}

  async function createNewPage(){if(!caps.can_write)return;const title=window.prompt('새 페이지 제목');if(!title?.trim())return;try{const created=await api<{page_id:string}>('/api/pages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:title.trim(),page_type:'note',markdown:`# ${title.trim()}\n\n`,parent_id:null,operation_id:crypto.randomUUID()})});await loadWorkspace(false);await openPage(created.page_id);}catch(error){setNotice(error instanceof Error?error.message:'페이지를 만들지 못했습니다.');}}

  return <main className="wiki-shell"><SiteTools/>
    <aside className="icon-rail" aria-label="주요 메뉴"><div className="brand-mark" aria-label="Liminal Wiki">LW</div><nav><button className="rail-button active" aria-label="문서">▤</button><button className="rail-button" aria-label="검색">⌕</button><button className="rail-button" aria-label="그래프">⌬</button></nav><button className="rail-button rail-bottom" aria-label="설정">⚙</button></aside>
    <aside className="knowledge-panel"><div className="workspace-heading"><div><p className="eyebrow">PERSONAL KNOWLEDGE</p><h1>Liminal Wiki</h1></div><button className="square-button" aria-label="새 페이지" onClick={createNewPage} disabled={!caps.can_write}>＋</button></div>
      <label className="search-box"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="지식 검색"/><kbd>⌘K</kbd></label><div className="panel-section-heading"><span>페이지</span><span>{filtered.length}</span></div>
      <nav className="page-tree" aria-label="페이지 트리">{filtered.map((page)=><button className={`tree-item ${active?.id===page.id?'active':''}`} key={page.id} onClick={()=>void openPage(page.id)}><span className="tree-glyph">{page.page_type==='concept'?'◇':'·'}</span><span><strong>{page.title}</strong><small>{page.page_type} · v{page.version}</small></span></button>)}</nav>
      <div className="agent-card"><div className="agent-pulse"><span/></div><div><strong>Site tools {caps.can_write?'읽기·쓰기':'읽기'} 준비</strong><p>열린 페이지의 세션 권한 사용</p></div><span className="agent-count">{caps.can_write?'09':'06'}</span></div>
    </aside>
    <section className="workspace"><header className="topbar"><div className="breadcrumbs"><span>Liminal Wiki</span><b>/</b><strong>{active?.title??'불러오는 중'}</strong></div><div className="top-actions"><span className={`sync-state ${dirty?'dirty':''}`}><i/>{dirty?'저장되지 않은 변경':status}</span><button className="ghost-button">공유</button><button className="avatar" aria-label="사용자 프로필">DH</button></div></header>
      <div className="document-stage"><article className="editor-card"><div className="document-meta"><span className="document-kicker">{active?.page_type?.toUpperCase()??'WIKI PAGE'}</span><div className="mode-switch" role="group" aria-label="편집 모드"><button className={mode==='edit'?'active':''} onClick={()=>setMode('edit')}>편집</button><button className={mode==='preview'?'active':''} onClick={()=>setMode('preview')}>미리보기</button></div></div>
        {notice&&<div className="conflict-banner" role="alert">{notice}<button onClick={()=>setNotice(null)} aria-label="알림 닫기">×</button></div>}
        {mode==='edit'?<textarea className="markdown-editor" aria-label="Markdown 편집기" spellCheck={false} value={markdown} readOnly={!caps.can_write} onChange={(event)=>setMarkdown(event.target.value)}/>:<MarkdownPreview value={markdown}/>}<footer className="editor-footer"><div><span>Markdown</span><span>{markdown.length}자</span><span>version {active?.version??'—'}</span></div><button className="save-button" disabled={!dirty||!caps.can_write} onClick={()=>void save()}>{dirty?'변경 저장':'저장 완료'}</button></footer></article>
        <aside className="context-panel"><section><div className="context-title"><span>연결된 지식</span><b>03</b></div>{['아키텍처','도구 계약','운영과 복구'].map((title,index)=><button className="linked-note" key={title}><i className={index===0?'coral':index===1?'lime':'blue'}/><span><strong>{title}</strong><small>{index===0?'UI와 도구의 공통 명령 계층':index===1?'닫힌 스키마와 안전장치':'리비전, export, restore'}</small></span><b>↗</b></button>)}</section>
          <section className="revision-section"><div className="context-title"><span>최근 리비전</span><button>전체 보기</button></div><ol className="timeline">{revisions.slice(0,5).map((revision)=><li key={revision.version}><i/><div><strong>{revision.change_summary??'페이지 변경'}</strong><small>{revision.origin} · {new Date(revision.created_at).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><span>v{revision.version}</span></li>)}</ol></section>
          <section className="safety-note"><span>VERSION GUARD</span><strong>덮어쓰기 전에 최신 버전을 확인합니다.</strong><p>사람과 에이전트의 동시 편집은 충돌 결과로 안전하게 멈춥니다.</p></section>
        </aside></div></section>
  </main>;
}
