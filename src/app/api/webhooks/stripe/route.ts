import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isStaleStripeEvent, stripePlanForSubscription, verifyStripeSignature } from "@/lib/billing/stripe";

type StripeObject = Record<string, unknown> & { metadata?: Record<string,string> };
type StripeEvent = { id:string; type:string; created?:number; data:{object:StripeObject} };

function periodEnd(value:unknown){
  const seconds=Number(value);
  return Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000):new Date(Date.now()+30*86400_000);
}

async function applyStripeEvent(workspaceId:string,event:{id:string;createdAt:Date},mutation:(tx:Prisma.TransactionClient)=>Promise<void>){
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lemiri:stripe:${workspaceId}`}, 0))`;
    const rows=await tx.$queryRaw<Array<{providerEventId:string|null;providerEventCreatedAt:Date|null}>>`SELECT "providerEventId", "providerEventCreatedAt" FROM "Subscription" WHERE "workspaceId"=${workspaceId}`;
    const cursor=rows[0]?{id:rows[0].providerEventId,createdAt:rows[0].providerEventCreatedAt}:undefined;
    if(isStaleStripeEvent(cursor,event))return false;
    await mutation(tx);
    await tx.$executeRaw`UPDATE "Subscription" SET "providerEventId"=${event.id}, "providerEventCreatedAt"=${event.createdAt} WHERE "workspaceId"=${workspaceId}`;
    return true;
  });
}

export async function POST(request:Request){
  const raw=await request.text();
  const signature=request.headers.get("stripe-signature")??"";
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!secret||!verifyStripeSignature(raw,signature,secret))return NextResponse.json({error:"INVALID_SIGNATURE"},{status:401});
  let event:StripeEvent;
  try{event=JSON.parse(raw) as StripeEvent}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400})}
  if(!event?.id||!event.type||!event.data?.object||!Number.isFinite(event.created)||Number(event.created)<=0)return NextResponse.json({error:"INVALID_EVENT"},{status:400});
  const cursorEvent={id:event.id,createdAt:new Date(Number(event.created)*1000)};
  const object=event.data.object;

  if(event.type==="checkout.session.completed"){
    const metadata=object.metadata;
    const workspaceId=String(metadata?.workspaceId??"");
    const reference=String(object.client_reference_id??"");
    const plan=metadata?.plan==="START"||metadata?.plan==="GROWTH"?metadata.plan:null;
    if(!workspaceId||reference!==workspaceId||!plan)return NextResponse.json({received:true,ignored:"INVALID_CHECKOUT_BINDING"});
    if(!await db.workspace.findUnique({where:{id:workspaceId},select:{id:true}}))return NextResponse.json({received:true,ignored:"UNKNOWN_WORKSPACE"});
    const applied=await applyStripeEvent(workspaceId,cursorEvent,async tx=>{await tx.subscription.upsert({where:{workspaceId},create:{workspaceId,provider:"STRIPE",externalCustomerId:String(object.customer??""),externalPlanId:String(object.subscription??""),plan,status:"INCOMPLETE",currentPeriodEnd:periodEnd(object.expires_at)},update:{externalCustomerId:String(object.customer??""),externalPlanId:String(object.subscription??"")}})});
    return NextResponse.json({received:true,...(!applied?{ignored:"STALE_EVENT"}:{})});
  }

  if(event.type.startsWith("customer.subscription.")){
    const subscriptionId=String(object.id??"");
    const customerId=String(object.customer??"");
    const metadataWorkspaceId=String(object.metadata?.workspaceId??"");
    const existing=await db.subscription.findFirst({where:{OR:[...(subscriptionId?[{externalPlanId:subscriptionId}]:[]),...(customerId?[{externalCustomerId:customerId}]:[])]}});
    if(existing&&metadataWorkspaceId&&existing.workspaceId!==metadataWorkspaceId)return NextResponse.json({received:true,ignored:"WORKSPACE_BINDING_MISMATCH"});
    const workspaceId=existing?.workspaceId??metadataWorkspaceId;
    if(!workspaceId)return NextResponse.json({received:true,ignored:"MISSING_WORKSPACE_BINDING"});
    if(!existing&&!await db.workspace.findUnique({where:{id:workspaceId},select:{id:true}}))return NextResponse.json({received:true,ignored:"UNKNOWN_WORKSPACE"});
    const status=String(object.status??"UNKNOWN").toUpperCase();
    const priceId=String((object.items as {data?:Array<{price?:{id?:string}}>}|undefined)?.data?.[0]?.price?.id??"");
    const plan=stripePlanForSubscription(priceId,process.env.STRIPE_START_PRICE_ID,process.env.STRIPE_GROWTH_PRICE_ID,existing?.plan,status);
    if(!plan)return NextResponse.json({received:true,ignored:"UNKNOWN_PRICE"});
    const applied=await applyStripeEvent(workspaceId,cursorEvent,async tx=>{await tx.subscription.upsert({where:{workspaceId},create:{workspaceId,provider:"STRIPE",externalCustomerId:customerId,externalPlanId:subscriptionId,plan,status,currentPeriodEnd:periodEnd(object.current_period_end),cancelAtPeriodEnd:Boolean(object.cancel_at_period_end)},update:{externalCustomerId:customerId||existing?.externalCustomerId,externalPlanId:subscriptionId||existing?.externalPlanId,plan,status,currentPeriodEnd:periodEnd(object.current_period_end),cancelAtPeriodEnd:Boolean(object.cancel_at_period_end)}})});
    if(!applied)return NextResponse.json({received:true,ignored:"STALE_EVENT"});
  }
  return NextResponse.json({received:true});
}
