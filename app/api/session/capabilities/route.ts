import { success } from '../../../../lib/contracts';
import { errorResponse,requestId } from '../../../../lib/http';
import { getWikiSession } from '../../../../lib/server-session';

export async function GET(){ const id=requestId(); try{ const session=await getWikiSession(); return Response.json(success({identity:{email:session.email,display_name:session.displayName},wiki:session.wikiId?{id:session.wikiId,title:session.wikiTitle,role:session.role}:null,capabilities:session.capabilities,site_version:session.siteVersion},id),{headers:{'cache-control':'no-store'}}); }catch(error){return errorResponse(error,id);} }
