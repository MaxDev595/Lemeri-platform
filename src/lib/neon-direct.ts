import { neon } from "@neondatabase/serverless";

function client() {
  const connectionString=process.env.DATABASE_URL?.trim();
  if(!connectionString)throw new Error("DATABASE_URL_MISSING");
  return neon(connectionString);
}

export async function createRegisteredUser(input:{name:string;email:string;passwordHash:string;company:string;slug:string;locale:"ru"|"en"}){
  const userId=crypto.randomUUID(),workspaceId=crypto.randomUUID(),memberId=crypto.randomUUID(),settingsId=crypto.randomUUID();
  const rows=await client().query(`
    WITH created_user AS (
      INSERT INTO "User" ("id","email","name","passwordHash") VALUES ($1,$2,$3,$4) RETURNING "id"
    ), created_workspace AS (
      INSERT INTO "Workspace" ("id","name","slug") SELECT $5,$6,$7 FROM created_user RETURNING "id"
    ), created_settings AS (
      INSERT INTO "WorkspaceSettings" ("id","workspaceId","locale","updatedAt") SELECT $8,"id",$9,CURRENT_TIMESTAMP FROM created_workspace
    ), created_member AS (
      INSERT INTO "WorkspaceMember" ("id","workspaceId","userId","role") SELECT $10,created_workspace."id",created_user."id",'OWNER'::"MemberRole" FROM created_workspace CROSS JOIN created_user
    ) SELECT "id" FROM created_user
  `,[userId,input.email,input.name,input.passwordHash,workspaceId,input.company,input.slug,settingsId,input.locale,memberId]);
  return{id:String((rows[0] as {id:string}).id)};
}

export async function createDirectSession(input:{userId:string;tokenHash:string;expiresAt:Date;ipHash:string|null;userAgent:string|null}){
  await client().query(`DELETE FROM "Session" WHERE "userId"=$1 AND "expiresAt"<CURRENT_TIMESTAMP`,[input.userId]);
  await client().query(`INSERT INTO "Session" ("id","tokenHash","userId","expiresAt","ipHash","userAgent") VALUES ($1,$2,$3,$4,$5,$6)`,[crypto.randomUUID(),input.tokenHash,input.userId,input.expiresAt,input.ipHash,input.userAgent]);
}

export async function directRateLimit(input:{key:string;windowStart:Date;expiresAt:Date}){
  const rows=await client().query(`INSERT INTO "RateLimitBucket" ("id","key","windowStart","count","expiresAt") VALUES ($1,$2,$3,1,$4) ON CONFLICT ("key","windowStart") DO UPDATE SET "count"="RateLimitBucket"."count"+1,"expiresAt"=EXCLUDED."expiresAt" RETURNING "count"`,[crypto.randomUUID(),input.key,input.windowStart,input.expiresAt]);
  return Number((rows[0] as {count:number}).count);
}

export async function getDirectSessionUser(tokenHash:string){
  const rows=await client().query(`SELECT u."id",u."email",u."name",u."passwordHash",u."createdAt",s."expiresAt",s."lastSeenAt",wm."id" AS "memberId",wm."workspaceId",wm."role",w."name" AS "workspaceName",w."slug",w."createdAt" AS "workspaceCreatedAt",ws."locale",ws."timezone",ws."theme" FROM "Session" s JOIN "User" u ON u."id"=s."userId" LEFT JOIN "WorkspaceMember" wm ON wm."userId"=u."id" LEFT JOIN "Workspace" w ON w."id"=wm."workspaceId" LEFT JOIN "WorkspaceSettings" ws ON ws."workspaceId"=w."id" WHERE s."tokenHash"=$1 AND s."expiresAt">CURRENT_TIMESTAMP`,[tokenHash]);
  if(!rows.length)return null;
  const first=rows[0] as Record<string,unknown>;
  return{id:String(first.id),email:String(first.email),name:first.name as string|null,passwordHash:String(first.passwordHash),createdAt:new Date(String(first.createdAt)),memberships:rows.filter(row=>(row as Record<string,unknown>).memberId).map(row=>{const value=row as Record<string,unknown>;return{id:String(value.memberId),workspaceId:String(value.workspaceId),userId:String(first.id),role:String(value.role),workspace:{id:String(value.workspaceId),name:String(value.workspaceName),slug:String(value.slug),createdAt:new Date(String(value.workspaceCreatedAt)),settings:{locale:String(value.locale??"ru"),timezone:String(value.timezone??"Europe/Moscow"),theme:String(value.theme??"system")}}}})};
}

export async function getDirectOnboardingState(workspaceId:string){
  const rows=await client().query(`SELECT (SELECT COUNT(*)::int FROM "AIEmployee" WHERE "workspaceId"=$1) AS "employeeCount",COALESCE((SELECT "locale" FROM "WorkspaceSettings" WHERE "workspaceId"=$1),'ru') AS "locale"`,[workspaceId]);
  const row=rows[0] as {employeeCount:number;locale:string};
  return{employeeCount:Number(row.employeeCount),locale:row.locale==="en"?"en" as const:"ru" as const};
}
