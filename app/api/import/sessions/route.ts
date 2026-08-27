import { createImportSession } from '../../../../db/wiki-repository';
import { success } from '../../../../lib/contracts';
import { errorResponse,jsonBody,requestId } from '../../../../lib/http';
import { requireImportAuthority } from '../../../../lib/server-session';
import { requireObject } from '../../../../lib/validation';

export async function POST(request:Request){const id=requestId();try{const session=await requireImportAuthority(),body=requireObject(await jsonBody(request)),result=await createImportSession({email:session.email,manifest:body.manifest,requestId:id});return Response.json(success(result,id),{status:201});}catch(error){return errorResponse(error,id);}}
