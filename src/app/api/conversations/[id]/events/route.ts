import { getApiWorkspace } from "@/lib/auth/api";
import { db } from "@/lib/db";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await getApiWorkspace();if(!auth)return new Response("Unauthorized",{status:401});
  const {id}=await params;const conversation=await db.conversation.findFirst({where:{id,workspaceId:auth.workspaceId},select:{id:true}});if(!conversation)return new Response("Not found",{status:404});
  const rawCursor=request.headers.get("last-event-id");const parsedCursor=rawCursor?Date.parse(rawCursor):NaN;let cursor=new Date(Number.isFinite(parsedCursor)?parsedCursor:Date.now()-1000);
  const encoder=new TextEncoder();let timer:ReturnType<typeof setInterval>|undefined;let querying=false;let closed=false;
  const stream=new ReadableStream({
    start(controller){
      controller.enqueue(encoder.encode(`retry: 3000\nevent: ready\ndata: {"conversationId":"${id}"}\n\n`));
      timer=setInterval(async()=>{if(querying||closed)return;querying=true;try{const messages=await db.message.findMany({where:{conversationId:id,createdAt:{gt:cursor}},orderBy:{createdAt:"asc"}});for(const message of messages){cursor=message.createdAt;controller.enqueue(encoder.encode(`id: ${message.createdAt.toISOString()}\nevent: message\ndata: ${JSON.stringify({id:message.id,direction:message.direction,content:message.content,createdAt:message.createdAt.toISOString()})}\n\n`))}if(!messages.length)controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`))}catch{closed=true;controller.close();if(timer)clearInterval(timer)}finally{querying=false}},1000);
      request.signal.addEventListener("abort",()=>{closed=true;if(timer)clearInterval(timer);try{controller.close()}catch{}});
    },
    cancel(){closed=true;if(timer)clearInterval(timer)},
  });
  return new Response(stream,{headers:{"content-type":"text/event-stream","cache-control":"no-cache, no-transform","connection":"keep-alive","x-accel-buffering":"no"}});
}
