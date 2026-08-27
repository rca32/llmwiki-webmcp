import { success } from '../../../../lib/contracts';
import { getPage,updatePage } from '../../../../db/wiki-repository';
import { errorResponse,jsonBody,originFrom,requestId } from '../../../../lib/http';
import { requireWikiSession } from '../../../../lib/server-session';
import { MAX_MARKDOWN,operationId,requireObject,requiredInteger,requiredString } from '../../../../lib/validation';

type Context={params:Promise<{pageId:string}>};
export async function GET(_request:Request,{params}:Context){ const id=requestId(); try{ const session=await requireWikiSession('can_read'); const {pageId}=await params; return Response.json(success({page:await getPage(session.wikiId!,pageId)},id),{headers:{'cache-control':'no-store'}}); }catch(error){return errorResponse(error,id);} }
export async function PATCH(request:Request,{params}:Context){ const id=requestId(); try{ const session=await requireWikiSession('can_write'); const {pageId}=await params,body=requireObject(await jsonBody(request)); const result=await updatePage({wikiId:session.wikiId!,email:session.email,pageId,expectedVersion:requiredInteger(body.expected_version,'expected_version',1),markdown:requiredString(body.markdown,'markdown',1,MAX_MARKDOWN),changeSummary:requiredString(body.change_summary??'Page updated','change_summary',1,500),operationId:operationId(body.operation_id),requestId:id,origin:originFrom(request)}); return Response.json(success(result,id,result.change_set)); }catch(error){return errorResponse(error,id);} }
