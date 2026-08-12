import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiWorkspace } from "@/lib/auth/api";
import { db } from "@/lib/db";
import { aggregateUsage } from "@/lib/billing/usage";
import { plans } from "@/lib/billing/types";
import { StripeBillingProvider } from "@/lib/billing/stripe";
const checkoutSchema=z.object({plan:z.enum(["START","GROWTH"])});
export async function GET(){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});const [usage,subscription]=await Promise.all([aggregateUsage(auth.workspaceId),db.subscription.findUnique({where:{workspaceId:auth.workspaceId}})]);const plan=(subscription?.plan&&subscription.plan in plans?subscription.plan:"TRIAL") as keyof typeof plans;return NextResponse.json({subscription:subscription??{plan:"TRIAL",status:"TRIALING"},limits:plans[plan],usage})}
export async function POST(request:Request){const auth=await getApiWorkspace();if(!auth)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});if(auth.membership.role!=="OWNER")return NextResponse.json({error:"FORBIDDEN"},{status:403});const parsed=checkoutSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"INVALID_REQUEST"},{status:400});const priceId=parsed.data.plan==="START"?process.env.STRIPE_START_PRICE_ID:process.env.STRIPE_GROWTH_PRICE_ID;if(!priceId)return NextResponse.json({error:"BILLING_PROVIDER_NOT_CONFIGURED"},{status:503});const base=process.env.PUBLIC_APP_URL??"http://localhost:3000";try{return NextResponse.json(await new StripeBillingProvider().createCheckout({workspaceId:auth.workspaceId,email:auth.user.email,priceId,plan:parsed.data.plan,successUrl:`${base}/app?billing=success`,cancelUrl:`${base}/app?billing=cancelled`}))}catch(error){return NextResponse.json({error:"CHECKOUT_FAILED",message:error instanceof Error?error.message:"Unknown error"},{status:502})}}
