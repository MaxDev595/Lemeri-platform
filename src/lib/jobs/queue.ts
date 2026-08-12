import { db } from "@/lib/db";

export const JOB_LEASE_MS=5*60_000;
export async function enqueueJob(workspaceId:string,type:string,payload:object,runAfter=new Date()){return db.backgroundJob.create({data:{workspaceId,type,payload,runAfter}})}

export async function claimJobs(limit=10,now=new Date()){
  const staleBefore=new Date(now.getTime()-JOB_LEASE_MS);
  const claimable={OR:[{status:"PENDING",runAfter:{lte:now}},{status:"RUNNING",lockedAt:{lt:staleBefore}}]};
  const candidates=await db.backgroundJob.findMany({where:claimable,orderBy:{createdAt:"asc"},take:limit});const claimed=[];
  for(const candidate of candidates){const updated=await db.backgroundJob.updateMany({where:{id:candidate.id,OR:[{status:"PENDING",runAfter:{lte:now}},{status:"RUNNING",lockedAt:{lt:staleBefore}}]},data:{status:"RUNNING",lockedAt:now,attempts:{increment:1}}});if(updated.count)claimed.push(candidate)}
  return claimed;
}
