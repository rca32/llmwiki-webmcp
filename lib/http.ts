import { failure } from './contracts';

export const requestId=()=>`req_${crypto.randomUUID()}`;
export async function jsonBody(request:Request):Promise<unknown>{ try{return await request.json();}catch{throw new Error('invalid_json');} }
export function errorResponse(error:unknown,id:string):Response{ const result=failure(error,id); return Response.json(result.body,{status:result.status,headers:{'cache-control':'no-store'}}); }
export function originFrom(request:Request):'human'|'webmcp'{ return request.headers.get('x-wiki-origin')==='webmcp'?'webmcp':'human'; }
