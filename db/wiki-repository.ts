import { env } from 'cloudflare:workers';
import { AppError,type ChangeSet,type PageType,type Role,type WikiPage } from '../lib/contracts';
import { extractWikiLinks,sha256,slugify,stableJson } from '../lib/validation';

const ROOT_PARENT='__root__'; const INLINE_REVISION_BYTES=64*1024;
let schemaReady:Promise<void>|null=null;

const schemaStatements=[
  `CREATE TABLE IF NOT EXISTS wikis (id TEXT PRIMARY KEY NOT NULL,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS wiki_members (wiki_id TEXT NOT NULL,user_email TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(wiki_id,user_email),FOREIGN KEY(wiki_id) REFERENCES wikis(id))`,
  `CREATE INDEX IF NOT EXISTS idx_wiki_members_email ON wiki_members(user_email)`,
  `CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,parent_id TEXT,parent_key TEXT NOT NULL,slug TEXT NOT NULL,title TEXT NOT NULL,page_type TEXT NOT NULL,markdown TEXT NOT NULL,frontmatter_json TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,last_operation_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,FOREIGN KEY(wiki_id) REFERENCES wikis(id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_pages_sibling_slug ON pages(wiki_id,parent_key,slug)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_wiki_parent ON pages(wiki_id,parent_id,sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_pages_wiki_updated ON pages(wiki_id,updated_at)`,
  `CREATE TABLE IF NOT EXISTS page_revisions (id TEXT PRIMARY KEY NOT NULL,page_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot_inline TEXT,snapshot_object_key TEXT,content_sha256 TEXT NOT NULL,frontmatter_json TEXT NOT NULL DEFAULT '{}',change_summary TEXT,actor_email TEXT NOT NULL,origin TEXT NOT NULL,save_kind TEXT NOT NULL,operation_id TEXT,status TEXT NOT NULL DEFAULT 'ready',is_pinned INTEGER NOT NULL DEFAULT 0,pinned_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(page_id) REFERENCES pages(id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_page_revisions_version ON page_revisions(page_id,version)`,
  `CREATE INDEX IF NOT EXISTS idx_page_revisions_recent ON page_revisions(page_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS page_links (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,source_page_id TEXT NOT NULL,target_page_id TEXT,target_text TEXT NOT NULL,link_kind TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_page_links_source ON page_links(wiki_id,source_page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_page_links_target ON page_links(wiki_id,target_page_id)`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (wiki_id TEXT NOT NULL,actor_email TEXT NOT NULL,operation_id TEXT NOT NULL,operation_name TEXT NOT NULL,request_hash TEXT NOT NULL,request_id TEXT NOT NULL,status TEXT NOT NULL,lease_expires_at TEXT NOT NULL,failure_retryable INTEGER,attempts INTEGER NOT NULL DEFAULT 1,result_json TEXT,created_at TEXT NOT NULL,completed_at TEXT,expires_at TEXT NOT NULL,PRIMARY KEY(wiki_id,actor_email,operation_name,operation_id))`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY NOT NULL,wiki_id TEXT NOT NULL,actor_email TEXT NOT NULL,origin TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,outcome TEXT NOT NULL,request_id TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS wiki_usage (wiki_id TEXT PRIMARY KEY NOT NULL,page_bytes INTEGER NOT NULL DEFAULT 0,revision_inline_bytes INTEGER NOT NULL DEFAULT 0,r2_ready_revision_bytes INTEGER NOT NULL DEFAULT 0,r2_ready_attachment_bytes INTEGER NOT NULL DEFAULT 0,r2_soft_deleted_bytes INTEGER NOT NULL DEFAULT 0,r2_pending_bytes INTEGER NOT NULL DEFAULT 0,r2_staging_import_bytes INTEGER NOT NULL DEFAULT 0,r2_orphan_estimate_bytes INTEGER NOT NULL DEFAULT 0,page_count INTEGER NOT NULL DEFAULT 0,revision_count INTEGER NOT NULL DEFAULT 0,attachment_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS site_state (id INTEGER PRIMARY KEY NOT NULL,active_wiki_id TEXT,bootstrap_status TEXT NOT NULL,reserved_by TEXT,reserved_at TEXT,lease_expires_at TEXT,last_error TEXT,version INTEGER NOT NULL,updated_at TEXT NOT NULL)`,
];

function db():D1Database{ if(!env.DB)throw new AppError('retryable_storage_error','Wiki storage is not available.',503,{},true); return env.DB; }
const now=()=>new Date().toISOString(); const uuid=()=>crypto.randomUUID();
const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;

export function ensureWikiSchema():Promise<void>{
  schemaReady??=(async()=>{ const d=db(); await d.batch(schemaStatements.map((sql)=>d.prepare(sql))); await d.prepare(`INSERT OR IGNORE INTO site_state(id,bootstrap_status,version,updated_at) VALUES(1,'empty',1,?)`).bind(now()).run(); })();
  return schemaReady;
}

export async function getMembership(email:string):Promise<{wikiId:string|null;wikiTitle:string|null;role:Role|null;bootstrapStatus:string;siteVersion:number}>{
  const row=await db().prepare(`SELECT s.active_wiki_id AS wiki_id,s.bootstrap_status,s.version AS site_version,w.title AS wiki_title,m.role FROM site_state s LEFT JOIN wikis w ON w.id=s.active_wiki_id AND w.status='active' LEFT JOIN wiki_members m ON m.wiki_id=s.active_wiki_id AND m.user_email=? WHERE s.id=1`).bind(email).first<Record<string,unknown>>();
  return { wikiId:typeof row?.wiki_id==='string'?row.wiki_id:null,wikiTitle:typeof row?.wiki_title==='string'?row.wiki_title:null,role:(row?.role as Role|undefined)??null,bootstrapStatus:String(row?.bootstrap_status??'empty'),siteVersion:Number(row?.site_version??1) };
}

export async function bootstrapWiki(input:{email:string;title:string;expectedVersion:number;requestId:string}){
  const d=db(),timestamp=now(),wikiId=uuid(),slug=`wiki-${wikiId.slice(0,8)}`;
  const reservation=await d.prepare(`UPDATE site_state SET bootstrap_status='reserved',reserved_by=?,reserved_at=?,lease_expires_at=?,version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='empty' AND version=?`).bind(input.email,timestamp,new Date(Date.now()+60_000).toISOString(),timestamp,input.expectedVersion).run();
  if((reservation.meta.changes??0)!==1)throw new AppError('validation_error','This Site already has an active or reserved wiki.',409);
  try{
    await d.batch([
      d.prepare(`INSERT INTO wikis(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)`).bind(wikiId,slug,input.title,timestamp,timestamp),
      d.prepare(`INSERT INTO wiki_members(wiki_id,user_email,role,created_at) VALUES(?,?,'owner',?)`).bind(wikiId,input.email,timestamp),
      d.prepare(`INSERT INTO wiki_usage(wiki_id,updated_at) VALUES(?,?)`).bind(wikiId,timestamp),
      d.prepare(`INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,'human','wiki.bootstrap','wiki',?,'success',?,'{}',?)`).bind(uuid(),wikiId,input.email,wikiId,input.requestId,timestamp),
      d.prepare(`UPDATE site_state SET active_wiki_id=?,bootstrap_status='active',reserved_by=NULL,reserved_at=NULL,lease_expires_at=NULL,version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='reserved' AND reserved_by=?`).bind(wikiId,timestamp,input.email),
    ]);
    return { id:wikiId,slug,title:input.title,role:'owner' as const };
  }catch(error){ await d.prepare(`UPDATE site_state SET bootstrap_status='empty',reserved_by=NULL,reserved_at=NULL,lease_expires_at=NULL,last_error='bootstrap_failed',version=version+1,updated_at=? WHERE id=1 AND bootstrap_status='reserved' AND reserved_by=?`).bind(now(),input.email).run(); throw error; }
}

type PageRow={id:string;wiki_id:string;parent_id:string|null;slug:string;title:string;page_type:PageType;markdown:string;version:number;sort_order:number;created_by:string;updated_by:string;created_at:string;updated_at:string};
async function pagePath(row:PageRow):Promise<string>{ const segments=[row.slug]; let parent=row.parent_id; for(let i=0;parent&&i<64;i++){ const found=await db().prepare(`SELECT parent_id,slug FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`).bind(parent,row.wiki_id).first<{parent_id:string|null;slug:string}>(); if(!found)break; segments.unshift(found.slug); parent=found.parent_id; } return `/${segments.join('/')}`; }
async function mapPage(row:PageRow):Promise<WikiPage>{ return {...row,path:await pagePath(row)}; }

export async function listPages(wikiId:string,parentId:string|null=null,limit=100){
  const result=await db().prepare(`SELECT id,wiki_id,parent_id,slug,title,page_type,markdown,version,sort_order,created_by,updated_by,created_at,updated_at FROM pages WHERE wiki_id=? AND deleted_at IS NULL AND ((? IS NULL AND parent_id IS NULL) OR parent_id=?) ORDER BY sort_order,title LIMIT ?`).bind(wikiId,parentId,parentId,limit).all<PageRow>();
  return Promise.all(result.results.map(mapPage));
}
export async function getPage(wikiId:string,pageId:string){ const row=await db().prepare(`SELECT id,wiki_id,parent_id,slug,title,page_type,markdown,version,sort_order,created_by,updated_by,created_at,updated_at FROM pages WHERE id=? AND wiki_id=? AND deleted_at IS NULL`).bind(pageId,wikiId).first<PageRow>(); if(!row)throw new AppError('not_found','The requested page was not found.',404,{page_id:pageId}); return mapPage(row); }

async function reserveIdempotency(input:{wikiId:string;email:string;operationId:string;operationName:string;payload:unknown;requestId:string}){
  const d=db(),requestHash=await sha256(stableJson(input.payload)),timestamp=now(),lease=new Date(Date.now()+30_000).toISOString(),expires=new Date(Date.now()+7*86_400_000).toISOString();
  const inserted=await d.prepare(`INSERT OR IGNORE INTO idempotency_keys(wiki_id,actor_email,operation_id,operation_name,request_hash,request_id,status,lease_expires_at,attempts,created_at,expires_at) VALUES(?,?,?,?,?,?,'pending',?,1,?,?)`).bind(input.wikiId,input.email,input.operationId,input.operationName,requestHash,input.requestId,lease,timestamp,expires).run();
  if((inserted.meta.changes??0)===1)return {requestHash,cached:null};
  const existing=await d.prepare(`SELECT request_hash,status,result_json,lease_expires_at FROM idempotency_keys WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`).bind(input.wikiId,input.email,input.operationName,input.operationId).first<{request_hash:string;status:string;result_json:string|null;lease_expires_at:string}>();
  if(!existing||existing.request_hash!==requestHash)throw new AppError('validation_error','operation_id was already used with different input.',409,{ operation_id:input.operationId });
  if(existing.status==='completed'&&existing.result_json)return {requestHash,cached:JSON.parse(existing.result_json) as Record<string,unknown>};
  if(existing.status==='failed'&&existing.result_json){ const saved=JSON.parse(existing.result_json) as {code:string;message:string;details?:Record<string,unknown>}; throw new AppError(saved.code as never,saved.message,409,saved.details??{}); }
  throw new AppError('idempotency_pending','The same operation is already in progress.',409,{ operation_id:input.operationId },true);
}

async function failIdempotency(input:{wikiId:string;email:string;operationId:string;operationName:string;error:AppError}){ await db().prepare(`UPDATE idempotency_keys SET status='failed',failure_retryable=?,result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`).bind(input.error.retryable?1:0,JSON.stringify({code:input.error.code,message:input.error.message,details:input.error.details}),now(),input.wikiId,input.email,input.operationName,input.operationId).run(); }

async function snapshot(wikiId:string,pageId:string,version:number,markdown:string,operationId:string){ const hash=await sha256(markdown); if(bytes(markdown)<=INLINE_REVISION_BYTES)return {inline:markdown,key:null,hash,cleanup:async()=>{}}; const key=`revisions/${wikiId}/${pageId}/${version}-${operationId}.md`; if(!env.FILES)throw new AppError('retryable_storage_error','Large revision storage is unavailable.',503,{},true); await env.FILES.put(key,markdown,{httpMetadata:{contentType:'text/markdown; charset=utf-8'},customMetadata:{sha256:hash}}); const saved=await env.FILES.get(key); if(!saved||await sha256(await saved.text())!==hash){ await env.FILES.delete(key); throw new AppError('retryable_storage_error','The large revision checksum could not be verified.',503,{},true); } return {inline:null,key,hash,cleanup:()=>env.FILES.delete(key)}; }

export async function createPage(input:{wikiId:string;email:string;title:string;pageType:PageType;markdown:string;parentId:string|null;operationId:string;requestId:string;origin:'human'|'webmcp'}):Promise<{page_id:string;version:number;path:string;title:string}>{
  const operationName='wiki_create_page',payload={title:input.title,page_type:input.pageType,markdown:input.markdown,parent_id:input.parentId},reservation=await reserveIdempotency({...input,operationName,payload}); if(reservation.cached)return reservation.cached as unknown as {page_id:string;version:number;path:string;title:string};
  const d=db(),pageId=uuid(),timestamp=now(),slug=slugify(input.title),parentKey=input.parentId??ROOT_PARENT;
  if(input.parentId)await getPage(input.wikiId,input.parentId);
  const snap=await snapshot(input.wikiId,pageId,1,input.markdown,input.operationId); const result={page_id:pageId,version:1,path:'',title:input.title};
  try{
    const statements=[
      d.prepare(`INSERT INTO pages(id,wiki_id,parent_id,parent_key,slug,title,page_type,markdown,version,sort_order,created_by,updated_by,last_operation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,0,?,?,?,?,?)`).bind(pageId,input.wikiId,input.parentId,parentKey,slug,input.title,input.pageType,input.markdown,input.email,input.email,input.operationId,timestamp,timestamp),
      d.prepare(`INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,'ready',?)`).bind(uuid(),pageId,snap.inline,snap.key,snap.hash,'Page created',input.email,input.origin,input.origin==='webmcp'?'webmcp':'explicit',input.operationId,timestamp),
      ...extractWikiLinks(input.markdown).map((target)=>d.prepare(`INSERT INTO page_links(id,wiki_id,source_page_id,target_page_id,target_text,link_kind,created_at) VALUES(?,?,?,(SELECT id FROM pages WHERE wiki_id=? AND title=? AND deleted_at IS NULL LIMIT 1),?,'wikilink',?)`).bind(uuid(),input.wikiId,pageId,input.wikiId,target,target,timestamp)),
      d.prepare(`UPDATE wiki_usage SET page_bytes=page_bytes+?,revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,page_count=page_count+1,revision_count=revision_count+1,updated_at=? WHERE wiki_id=?`).bind(bytes(input.markdown),snap.inline?bytes(input.markdown):0,snap.key?bytes(input.markdown):0,timestamp,input.wikiId),
      d.prepare(`INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) VALUES(?,?,?,?, 'page.create','page',?,'success',?,?,?)`).bind(uuid(),input.wikiId,input.email,input.origin,pageId,input.requestId,JSON.stringify({version:1}),timestamp),
      d.prepare(`UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`).bind(JSON.stringify(result),timestamp,input.wikiId,input.email,operationName,input.operationId),
    ];
    await d.batch(statements); result.path=await pagePath({id:pageId,wiki_id:input.wikiId,parent_id:input.parentId,slug,title:input.title,page_type:input.pageType,markdown:input.markdown,version:1,sort_order:0,created_by:input.email,updated_by:input.email,created_at:timestamp,updated_at:timestamp}); await d.prepare(`UPDATE idempotency_keys SET result_json=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=?`).bind(JSON.stringify(result),input.wikiId,input.email,operationName,input.operationId).run(); return result;
  }catch(error){ await snap.cleanup(); const appError=error instanceof AppError?error:new AppError('validation_error','A sibling page already uses this title or path.',409,{slug}); await failIdempotency({...input,operationName,error:appError}); throw appError; }
}

export async function updatePage(input:{wikiId:string;email:string;pageId:string;expectedVersion:number;markdown:string;changeSummary:string;operationId:string;requestId:string;origin:'human'|'webmcp'}):Promise<{page_id:string;version:number;change_set:ChangeSet}>{
  const operationName='wiki_update_page',payload={page_id:input.pageId,expected_version:input.expectedVersion,markdown:input.markdown,change_summary:input.changeSummary},reservation=await reserveIdempotency({...input,operationName,payload}); if(reservation.cached)return reservation.cached as unknown as {page_id:string;version:number;change_set:ChangeSet};
  const current=await getPage(input.wikiId,input.pageId); const nextVersion=input.expectedVersion+1,timestamp=now();
  if(current.version!==input.expectedVersion){ const error=new AppError('version_conflict','The page changed after it was read.',409,{page_id:input.pageId,expected_version:input.expectedVersion,current_version:current.version,next_action:'Read the current page and retry with an intentional merge.'}); await failIdempotency({...input,operationName,error}); throw error; }
  const snap=await snapshot(input.wikiId,input.pageId,nextVersion,input.markdown,input.operationId),links=extractWikiLinks(input.markdown),d=db();
  const changeSet:ChangeSet={pages_changed:[input.pageId],tree_changed:false,links_changed:true,search_changed:true,graph_changed:true}; const result={page_id:input.pageId,version:nextVersion,change_set:changeSet};
  try{
    const statements=[
      d.prepare(`UPDATE pages SET markdown=?,version=version+1,updated_by=?,updated_at=?,last_operation_id=? WHERE id=? AND wiki_id=? AND version=? AND deleted_at IS NULL`).bind(input.markdown,input.email,timestamp,input.operationId,input.pageId,input.wikiId,input.expectedVersion),
      d.prepare(`INSERT INTO page_revisions(id,page_id,version,snapshot_inline,snapshot_object_key,content_sha256,change_summary,actor_email,origin,save_kind,operation_id,status,created_at) SELECT ?,p.id,p.version,?,?,?,?,?,?,?,?,'ready',? FROM pages p WHERE p.id=? AND p.wiki_id=? AND p.last_operation_id=?`).bind(uuid(),snap.inline,snap.key,snap.hash,input.changeSummary,input.email,input.origin,input.origin==='webmcp'?'webmcp':'explicit',input.operationId,timestamp,input.pageId,input.wikiId,input.operationId),
      d.prepare(`DELETE FROM page_links WHERE wiki_id=? AND source_page_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND wiki_id=? AND last_operation_id=?)`).bind(input.wikiId,input.pageId,input.pageId,input.wikiId,input.operationId),
      ...links.map((target)=>d.prepare(`INSERT INTO page_links(id,wiki_id,source_page_id,target_page_id,target_text,link_kind,created_at) SELECT ?,?,?,(SELECT id FROM pages WHERE wiki_id=? AND title=? AND deleted_at IS NULL LIMIT 1),?,'wikilink',? FROM pages p WHERE p.id=? AND p.wiki_id=? AND p.last_operation_id=?`).bind(uuid(),input.wikiId,input.pageId,input.wikiId,target,target,timestamp,input.pageId,input.wikiId,input.operationId)),
      d.prepare(`UPDATE wiki_usage SET page_bytes=page_bytes+?,revision_inline_bytes=revision_inline_bytes+?,r2_ready_revision_bytes=r2_ready_revision_bytes+?,revision_count=revision_count+1,updated_at=? WHERE wiki_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`).bind(bytes(input.markdown)-bytes(current.markdown),snap.inline?bytes(input.markdown):0,snap.key?bytes(input.markdown):0,timestamp,input.wikiId,input.pageId,input.operationId),
      d.prepare(`INSERT INTO audit_events(id,wiki_id,actor_email,origin,action,target_type,target_id,outcome,request_id,metadata_json,created_at) SELECT ?,?,?,?,'page.update','page',?,'success',?,?,? FROM pages p WHERE p.id=? AND p.last_operation_id=?`).bind(uuid(),input.wikiId,input.email,input.origin,input.pageId,input.requestId,JSON.stringify({from_version:input.expectedVersion,to_version:nextVersion}),timestamp,input.pageId,input.operationId),
      d.prepare(`UPDATE idempotency_keys SET status='completed',result_json=?,completed_at=? WHERE wiki_id=? AND actor_email=? AND operation_name=? AND operation_id=? AND EXISTS(SELECT 1 FROM pages WHERE id=? AND last_operation_id=?)`).bind(JSON.stringify(result),timestamp,input.wikiId,input.email,operationName,input.operationId,input.pageId,input.operationId),
    ];
    const batch=await d.batch(statements); if((batch[0].meta.changes??0)!==1){ await snap.cleanup(); const latest=await getPage(input.wikiId,input.pageId); const error=new AppError('version_conflict','The page changed after it was read.',409,{page_id:input.pageId,expected_version:input.expectedVersion,current_version:latest.version,next_action:'Read the current page and retry with an intentional merge.'}); await failIdempotency({...input,operationName,error}); throw error; } return result;
  }catch(error){ if(error instanceof AppError)throw error; await snap.cleanup(); const appError=new AppError('internal_error','The page update could not be completed.',500,{},true); await failIdempotency({...input,operationName,error:appError}); throw appError; }
}

export async function appendPage(input:{wikiId:string;email:string;pageId:string;expectedVersion:number;content:string;section:string|null;operationId:string;requestId:string;origin:'human'|'webmcp'}){
  const page=await getPage(input.wikiId,input.pageId);
  let markdown=page.markdown;
  if(input.section){
    const lines=markdown.split('\n'),headingIndex=lines.findIndex((line)=>line.replace(/^#+\s*/, '').trim().toLowerCase()===input.section!.toLowerCase());
    if(headingIndex>=0){ let insertAt=headingIndex+1; const level=(lines[headingIndex].match(/^#+/)?.[0].length??1); while(insertAt<lines.length){ const next=lines[insertAt].match(/^(#+)\s/); if(next&&next[1].length<=level)break; insertAt++; } lines.splice(insertAt,0,'',input.content); markdown=lines.join('\n'); }
    else markdown=`${markdown.trimEnd()}\n\n## ${input.section}\n\n${input.content}`;
  }else markdown=`${markdown.trimEnd()}\n\n${input.content}`;
  return updatePage({wikiId:input.wikiId,email:input.email,pageId:input.pageId,expectedVersion:input.expectedVersion,markdown,changeSummary:`Appended${input.section?` to ${input.section}`:''}`,operationId:input.operationId,requestId:input.requestId,origin:input.origin});
}

export async function searchPages(wikiId:string,query:string,pageTypes:PageType[],limit:number){ const like=`%${query.replace(/[\\%_]/g,'\\$&')}%`; const typePlaceholders=pageTypes.length?pageTypes.map(()=>'?').join(','):''; const sql=`SELECT id,wiki_id,parent_id,slug,title,page_type,markdown,version,sort_order,created_by,updated_by,created_at,updated_at FROM pages WHERE wiki_id=? AND deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR markdown LIKE ? ESCAPE '\\') ${pageTypes.length?`AND page_type IN (${typePlaceholders})`:''} ORDER BY CASE WHEN lower(title)=lower(?) THEN 0 WHEN lower(title) LIKE lower(?) THEN 1 ELSE 2 END,updated_at DESC LIMIT ?`; const args=[wikiId,like,like,...pageTypes,query,`${query}%`,limit]; const rows=await db().prepare(sql).bind(...args).all<PageRow>(); return Promise.all(rows.results.map(async(row)=>({page_id:row.id,title:row.title,path:await pagePath(row),page_type:row.page_type,snippet:row.markdown.slice(0,240),version:row.version,updated_at:row.updated_at}))); }
export async function listRevisions(wikiId:string,pageId:string,limit:number){ await getPage(wikiId,pageId); const rows=await db().prepare(`SELECT version,change_summary,actor_email,origin,save_kind,status,is_pinned,created_at FROM page_revisions WHERE page_id=? ORDER BY version DESC LIMIT ?`).bind(pageId,limit).all(); return rows.results; }
export async function getNeighbors(wikiId:string,pageId:string,limit:number){ await getPage(wikiId,pageId); const rows=await db().prepare(`SELECT l.source_page_id,l.target_page_id,l.target_text,p.title AS target_title,p.version AS target_version FROM page_links l LEFT JOIN pages p ON p.id=l.target_page_id AND p.wiki_id=l.wiki_id WHERE l.wiki_id=? AND (l.source_page_id=? OR l.target_page_id=?) LIMIT ?`).bind(wikiId,pageId,pageId,limit).all(); return rows.results; }
