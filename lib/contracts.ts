export type Role = 'owner'|'editor'|'viewer';
export type PageType = 'note'|'source'|'concept'|'entity'|'synthesis'|'comparison'|'query';
export type ErrorCode = 'unauthenticated'|'forbidden'|'not_found'|'validation_error'|'version_conflict'|'idempotency_pending'|'quota_exceeded'|'retryable_storage_error'|'internal_error';
export type Capabilities = { can_bootstrap:boolean; can_read:boolean; can_export_portable:boolean; can_write:boolean; can_restore:boolean; can_manage_attachments:boolean; can_soft_delete:boolean; can_manage_members:boolean; can_full_backup:boolean; can_import:boolean };
export type ChangeSet = { pages_changed:string[]; tree_changed:boolean; links_changed:boolean; search_changed:boolean; graph_changed:boolean };
export type SuccessEnvelope<T> = { ok:true; data:T; request_id:string; change_set:ChangeSet|null };
export type ErrorEnvelope = { ok:false; error:{ code:ErrorCode; message:string; retryable:boolean; details:Record<string,unknown> }; request_id:string };
export type Envelope<T> = SuccessEnvelope<T>|ErrorEnvelope;
export type WikiPage = { id:string; wiki_id:string; parent_id:string|null; slug:string; path:string; title:string; page_type:PageType; markdown:string; version:number; sort_order:number; created_by:string; updated_by:string; created_at:string; updated_at:string };
export class AppError extends Error { constructor(public code:ErrorCode,message:string,public status:number,public details:Record<string,unknown>={},public retryable=false){ super(message); } }
export const READ_CAPABILITIES:Capabilities = { can_bootstrap:false,can_read:true,can_export_portable:true,can_write:false,can_restore:false,can_manage_attachments:false,can_soft_delete:false,can_manage_members:false,can_full_backup:false,can_import:false };
export function capabilitiesFor(role:Role|null,canBootstrap=false):Capabilities { const base={...READ_CAPABILITIES,can_bootstrap:canBootstrap,can_read:role!==null,can_export_portable:role!==null}; if(!role||role==='viewer')return base; const editor={...base,can_write:true,can_restore:true,can_manage_attachments:true,can_soft_delete:true}; return role==='owner'?{...editor,can_manage_members:true,can_full_backup:true,can_import:true}:editor; }
export function success<T>(data:T,requestId:string,changeSet:ChangeSet|null=null):SuccessEnvelope<T>{ return {ok:true,data,request_id:requestId,change_set:changeSet}; }
export function failure(error:unknown,requestId:string):{body:ErrorEnvelope;status:number}{ const e=error instanceof AppError?error:new AppError('internal_error','The wiki could not complete this request.',500); return {status:e.status,body:{ok:false,error:{code:e.code,message:e.message,retryable:e.retryable,details:e.details},request_id:requestId}}; }
