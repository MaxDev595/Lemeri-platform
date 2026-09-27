import { NextResponse } from "next/server";
import { runJobBatch } from "@/lib/jobs/worker";
export async function POST(request:Request){const secret=process.env.CRON_SECRET;const cronToken=(globalThis as {__lemiriCronToken?:string}).__lemiriCronToken;const fromCronTrigger=Boolean(cronToken)&&request.headers.get("x-lemiri-cron")===cronToken;if(!fromCronTrigger&&(!secret||request.headers.get("authorization")!==`Bearer ${secret}`))return NextResponse.json({error:"UNAUTHORIZED"},{status:401});return NextResponse.json({results:await runJobBatch(20)})}
