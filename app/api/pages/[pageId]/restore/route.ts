import { success } from '../../../../../lib/contracts';
import { restoreRevision } from '../../../../../db/wiki-repository';
import { errorResponse,jsonBody,originFrom,requestId } from '../../../../../lib/http';
import { requireWikiSession } from '../../../../../lib/server-session';
import { operationId,requireObject,requiredInteger } from '../../../../../lib/validation';

type Context={params:Promise<{pageId:string}>};
export async function POST(request:Request,{params}:Context){ const id=requestId(); try{ const session=await requireWikiSession('can_restore'),{pageId}=await params,body=requireObject(await jsonBody(request)); const result=await restoreRevision({wikiId:session.wikiId!,email:session.email,pageId,expectedVersion:requiredInteger(body.expected_version,'expected_version',1),restoreVersion:requiredInteger(body.restore_version,'restore_version',1),operationId:operationId(body.operation_id),requestId:id,origin:originFrom(request)}); return Response.json(success(result,id,result.change_set)); }catch(error){return errorResponse(error,id);} }
