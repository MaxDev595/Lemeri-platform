import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCheckout, BillingProvider } from "./types";
// Price ids: STRIPE_STARTER_PRICE_ID / STRIPE_CUSTOM_PRICE_ID. The old
// STRIPE_START_PRICE_ID / STRIPE_GROWTH_PRICE_ID are still honoured so existing
// subscriptions keep mapping to a plan (START → Starter, GROWTH → Custom).
// Yearly (−20%): STRIPE_STARTER_YEARLY_PRICE_ID / STRIPE_CUSTOM_YEARLY_PRICE_ID.
export function priceIdFor(plan:"STARTER"|"CUSTOM",env:Record<string,string|undefined>=process.env,interval:"month"|"year"="month"){if(interval==="year")return plan==="STARTER"?env.STRIPE_STARTER_YEARLY_PRICE_ID:env.STRIPE_CUSTOM_YEARLY_PRICE_ID;return plan==="STARTER"?(env.STRIPE_STARTER_PRICE_ID||env.STRIPE_START_PRICE_ID):(env.STRIPE_CUSTOM_PRICE_ID||env.STRIPE_GROWTH_PRICE_ID)}
async function stripe<T>(path:string,method:"GET"|"POST",form?:URLSearchParams){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("BILLING_PROVIDER_NOT_CONFIGURED");
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers:{authorization:`Bearer ${key}`,...(form?{"content-type":"application/x-www-form-urlencoded"}:{})},body:form});
  const body=await response.json() as T&{error?:{message?:string}};if(!response.ok)throw new Error(body.error?.message??"STRIPE_REQUEST_FAILED");return body;
}
/** Switch an existing subscription to another price (Starter ⇄ Custom) with proration, instead of a second checkout. */
export async function changeSubscriptionPrice(subscriptionId:string,priceId:string){
  const current=await stripe<{items?:{data?:Array<{id:string}>}}>(`subscriptions/${encodeURIComponent(subscriptionId)}`,"GET");
  const itemId=current.items?.data?.[0]?.id;if(!itemId)throw new Error("STRIPE_SUBSCRIPTION_ITEM_MISSING");
  return stripe<{id:string;status:string}>(`subscriptions/${encodeURIComponent(subscriptionId)}`,"POST",new URLSearchParams({"items[0][id]":itemId,"items[0][price]":priceId,proration_behavior:"create_prorations",cancel_at_period_end:"false"}));
}
/** Stripe customer portal: payment method, invoices, cancellation. */
export async function billingPortalUrl(customerId:string,returnUrl:string){
  const session=await stripe<{url:string}>("billing_portal/sessions","POST",new URLSearchParams({customer:customerId,return_url:returnUrl}));return session.url;
}
export class StripeBillingProvider implements BillingProvider {
  async createCheckout(input: BillingCheckout) {
    const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("BILLING_PROVIDER_NOT_CONFIGURED");
    const form=new URLSearchParams({mode:"subscription",success_url:input.successUrl,cancel_url:input.cancelUrl,customer_email:input.email,client_reference_id:input.workspaceId,"line_items[0][price]":input.priceId,"line_items[0][quantity]":"1","metadata[workspaceId]":input.workspaceId,"metadata[plan]":input.plan,"subscription_data[metadata][workspaceId]":input.workspaceId,"subscription_data[metadata][plan]":input.plan});
    const response=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/x-www-form-urlencoded"},body:form});
    const body=await response.json() as {id?:string;url?:string;error?:{message?:string}};if(!response.ok||!body.id||!body.url)throw new Error(body.error?.message??"STRIPE_CHECKOUT_FAILED");return{id:body.id,url:body.url};
  }
}
export function verifyStripeSignature(raw:string,header:string,secret:string,toleranceSeconds=300){
  const entries=header.split(",").map(part=>part.trim().split("=",2) as [string,string]);
  const timestamp=Number(entries.find(([key])=>key==="t")?.[1]);
  const signatures=entries.filter(([key,value])=>key==="v1"&&Boolean(value)).map(([,value])=>value);
  if(!timestamp||!signatures.length||Math.abs(Date.now()/1000-timestamp)>toleranceSeconds)return false;
  const expected=Buffer.from(createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex"));
  return signatures.some(signature=>{const candidate=Buffer.from(signature);return candidate.length===expected.length&&timingSafeEqual(candidate,expected)});
}

/** Plan for a Stripe price id. Legacy price ids map to the new plans. */
export function stripePlanFromPriceId(priceId:string,env:Record<string,string|undefined>=process.env){
  if(!priceId)return null;
  const starter=[env.STRIPE_STARTER_PRICE_ID,env.STRIPE_STARTER_YEARLY_PRICE_ID,env.STRIPE_START_PRICE_ID].filter(Boolean);
  const custom=[env.STRIPE_CUSTOM_PRICE_ID,env.STRIPE_CUSTOM_YEARLY_PRICE_ID,env.STRIPE_GROWTH_PRICE_ID].filter(Boolean);
  if(starter.includes(priceId))return "STARTER" as const;
  if(custom.includes(priceId))return "CUSTOM" as const;
  return null;
}

export function stripePlanForSubscription(priceId:string,currentPlan:string|undefined,status:string,env:Record<string,string|undefined>=process.env){
  const configured=stripePlanFromPriceId(priceId,env);
  if(configured)return configured;
  // An ended subscription may report an archived price: keep the plan it had (access is decided by status).
  const known=currentPlan==="STARTER"||currentPlan==="CUSTOM"?currentPlan:currentPlan==="START"?"STARTER":currentPlan==="GROWTH"?"CUSTOM":null;
  if(status!=="ACTIVE"&&status!=="TRIALING"&&known)return known;
  return null;
}

export function isStaleStripeEvent(cursor:{id:string|null;createdAt:Date|null}|undefined,event:{id:string;createdAt:Date}){
  if(!cursor)return false;
  return cursor.id===event.id||Boolean(cursor.createdAt&&event.createdAt<cursor.createdAt);
}
