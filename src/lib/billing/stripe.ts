import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCheckout, BillingProvider } from "./types";
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

export function stripePlanFromPriceId(priceId:string,startPriceId:string|undefined,growthPriceId:string|undefined){
  if(startPriceId&&priceId===startPriceId)return "START" as const;
  if(growthPriceId&&priceId===growthPriceId)return "GROWTH" as const;
  return null;
}

export function stripePlanForSubscription(priceId:string,startPriceId:string|undefined,growthPriceId:string|undefined,currentPlan:string|undefined,status:string){
  const configured=stripePlanFromPriceId(priceId,startPriceId,growthPriceId);
  if(configured)return configured;
  if(status!=="ACTIVE"&&status!=="TRIALING"&&(currentPlan==="START"||currentPlan==="GROWTH"))return currentPlan;
  return null;
}

export function isStaleStripeEvent(cursor:{id:string|null;createdAt:Date|null}|undefined,event:{id:string;createdAt:Date}){
  if(!cursor)return false;
  return cursor.id===event.id||Boolean(cursor.createdAt&&event.createdAt<cursor.createdAt);
}
