import { neon } from "@neondatabase/serverless";

function client() {
  const connectionString=process.env.DATABASE_URL?.trim();
  if(!connectionString)throw new Error("DATABASE_URL_MISSING");
  return neon(connectionString);
}

async function ensurePgcrypto(){await client().query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)}

export async function createRegisteredUser(input:{name:string;email:string;password:string;company:string;slug:string;locale:"ru"|"en"}){
  await ensurePgcrypto();
  const userId=crypto.randomUUID(),workspaceId=crypto.randomUUID(),memberId=crypto.randomUUID(),settingsId=crypto.randomUUID();
  const rows=await client().query(`
    WITH created_user AS (
      INSERT INTO "User" ("id","email","name","passwordHash") VALUES ($1,$2,$3,crypt(encode(digest($4,'sha256'),'hex'),gen_salt('bf',10))) RETURNING "id"
    ), created_workspace AS (
      INSERT INTO "Workspace" ("id","name","slug") SELECT $5,$6,$7 FROM created_user RETURNING "id"
    ), created_settings AS (
      INSERT INTO "WorkspaceSettings" ("id","workspaceId","locale","updatedAt") SELECT $8,"id",$9,CURRENT_TIMESTAMP FROM created_workspace
    ), created_member AS (
      INSERT INTO "WorkspaceMember" ("id","workspaceId","userId","role") SELECT $10,created_workspace."id",created_user."id",'OWNER'::"MemberRole" FROM created_workspace CROSS JOIN created_user
    ) SELECT "id" FROM created_user
  `,[userId,input.email,input.name,input.password,workspaceId,input.company,input.slug,settingsId,input.locale,memberId]);
  return{id:String((rows[0] as {id:string}).id)};
}

export async function createDirectSession(input:{userId:string;tokenHash:string;expiresAt:Date;ipHash:string|null;userAgent:string|null}){
  await client().query(`DELETE FROM "Session" WHERE "userId"=$1 AND "expiresAt"<CURRENT_TIMESTAMP`,[input.userId]);
  await client().query(`INSERT INTO "Session" ("id","tokenHash","userId","expiresAt","ipHash","userAgent") VALUES ($1,$2,$3,$4,$5,$6)`,[crypto.randomUUID(),input.tokenHash,input.userId,input.expiresAt,input.ipHash,input.userAgent]);
}

export async function deleteDirectSession(tokenHash:string){
  await client().query(`DELETE FROM "Session" WHERE "tokenHash"=$1`,[tokenHash]);
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

export async function getDirectUserByEmail(email:string){
  const rows=await client().query(`SELECT "id","email","name","passwordHash","createdAt" FROM "User" WHERE "email"=$1 LIMIT 1`,[email]);
  if(!rows.length)return null;
  const value=rows[0] as Record<string,unknown>;
  return{id:String(value.id),email:String(value.email),name:value.name as string|null,passwordHash:String(value.passwordHash),createdAt:new Date(String(value.createdAt))};
}

export async function verifyDirectUserPassword(email:string,password:string){
  await ensurePgcrypto();
  const rows=await client().query(`SELECT "id","email","name","passwordHash","createdAt",CASE WHEN "passwordHash" LIKE '$2%' THEN "passwordHash"=crypt(encode(digest($2,'sha256'),'hex'),"passwordHash") ELSE false END AS "passwordValid",("passwordHash" LIKE 'pbkdf2-sha256:%' OR "passwordHash" LIKE 'scrypt:%') AS "legacyPassword" FROM "User" WHERE "email"=$1 LIMIT 1`,[email,password]);
  if(!rows.length)return null;
  const value=rows[0] as Record<string,unknown>;
  return{id:String(value.id),email:String(value.email),name:value.name as string|null,passwordHash:String(value.passwordHash),createdAt:new Date(String(value.createdAt)),passwordValid:Boolean(value.passwordValid),legacyPassword:Boolean(value.legacyPassword)};
}

export async function createDirectPasswordReset(email:string,tokenHash:string,expiresAt:Date){
  const rows=await client().query(`WITH target AS (SELECT "id","email" FROM "User" WHERE "email"=$1),removed AS (DELETE FROM "PasswordResetToken" p USING target t WHERE p."userId"=t."id"),created AS (INSERT INTO "PasswordResetToken" ("id","tokenHash","userId","expiresAt") SELECT $2,$3,t."id",$4 FROM target t RETURNING "userId") SELECT t."id",t."email" FROM target t JOIN created c ON c."userId"=t."id"`,[email,crypto.randomUUID(),tokenHash,expiresAt]);
  if(!rows.length)return null;const value=rows[0] as Record<string,unknown>;return{id:String(value.id),email:String(value.email)};
}

export async function resetDirectPassword(tokenHash:string,password:string){
  await ensurePgcrypto();
  const rows=await client().query(`WITH consumed AS (DELETE FROM "PasswordResetToken" WHERE "tokenHash"=$1 AND "expiresAt">CURRENT_TIMESTAMP RETURNING "userId"),updated AS (UPDATE "User" u SET "passwordHash"=crypt(encode(digest($2,'sha256'),'hex'),gen_salt('bf',10)) FROM consumed c WHERE u."id"=c."userId" RETURNING u."id"),removed_sessions AS (DELETE FROM "Session" s USING updated u WHERE s."userId"=u."id"),removed_tokens AS (DELETE FROM "PasswordResetToken" p USING updated u WHERE p."userId"=u."id") SELECT "id" FROM updated`,[tokenHash,password]);
  return rows.length?String((rows[0] as {id:string}).id):null;
}

export async function getDirectOnboardingState(workspaceId:string){
  const rows=await client().query(`SELECT (SELECT COUNT(*)::int FROM "AIEmployee" WHERE "workspaceId"=$1) AS "employeeCount",COALESCE((SELECT "locale" FROM "WorkspaceSettings" WHERE "workspaceId"=$1),'ru') AS "locale"`,[workspaceId]);
  const row=rows[0] as {employeeCount:number;locale:string};
  return{employeeCount:Number(row.employeeCount),locale:row.locale==="en"?"en" as const:"ru" as const};
}

export async function getDirectWorkspaceSettings(workspaceId:string){
  const rows=await client().query(`SELECT "locale","timezone","theme","dataRetentionDays","analyticsEnabled","aiTrainingOptIn","logoUrl","workingHours" FROM "WorkspaceSettings" WHERE "workspaceId"=$1 LIMIT 1`,[workspaceId]);
  if(!rows.length)throw new Error("WORKSPACE_SETTINGS_NOT_FOUND");
  return rows[0];
}

export async function createDirectOnboardingEmployee(input:{
  workspaceId:string;userId:string;name:string;role:string;status:"ACTIVE"|"DRAFT";goal:string;tone:string;instructions:string|null;
  handoffRules:Record<string,unknown>;knowledgeTitle?:string;knowledgeContent?:string;chunks:Array<{content:string;sourceLabel:string}>;
  websiteConfigEncrypted?:string;crmCredentialsEncrypted?:string;auditMetadata:Record<string,unknown>;
}){
  const employeeId=crypto.randomUUID(),settingsId=crypto.randomUUID();
  const sourceId=input.knowledgeContent?crypto.randomUUID():null,documentId=sourceId?crypto.randomUUID():null;
  const channelId=input.websiteConfigEncrypted?crypto.randomUUID():null,integrationId=input.crmCredentialsEncrypted?crypto.randomUUID():null;
  const rows=await client().query(`
    WITH employee AS (
      INSERT INTO "AIEmployee" ("id","workspaceId","name","role","status","updatedAt")
      VALUES ($1,$2,$3,$4,$5::"EmployeeStatus",CURRENT_TIMESTAMP) RETURNING "id"
    ), employee_settings AS (
      INSERT INTO "AIEmployeeSettings" ("id","employeeId","goal","tone","instructions","handoffRules")
      SELECT $6,"id",$7,$8,$9,$10::jsonb FROM employee
    ), source AS (
      INSERT INTO "KnowledgeSource" ("id","workspaceId","type","title","status")
      SELECT $11,$2,'TEXT',$12,'PROCESSING' WHERE $11::text IS NOT NULL RETURNING "id"
    ), document AS (
      INSERT INTO "KnowledgeDocument" ("id","sourceId","title","content")
      SELECT $13,"id",$12,$14 FROM source RETURNING "id"
    ), chunks AS (
      INSERT INTO "KnowledgeChunk" ("id","documentId","content","sourceLabel")
      SELECT gen_random_uuid()::text,document."id",item.content,item.label
      FROM document CROSS JOIN LATERAL jsonb_to_recordset($15::jsonb) AS item(content text,label text)
    ), knowledge_job AS (
      INSERT INTO "BackgroundJob" ("id","workspaceId","type","payload")
      SELECT gen_random_uuid()::text,$2,'KNOWLEDGE_INDEX',jsonb_build_object('sourceId',source."id") FROM source
    ), website_channel AS (
      INSERT INTO "Channel" ("id","workspaceId","employeeId","type","status","externalId","configEncrypted","updatedAt")
      SELECT $16,$2,employee."id",'WEBSITE','CONNECTED','embedded-widget',$17,CURRENT_TIMESTAMP FROM employee WHERE $16::text IS NOT NULL
    ), crm_integration AS (
      INSERT INTO "Integration" ("id","workspaceId","provider","status","credentialsEncrypted","updatedAt")
      SELECT $18,$2,'CRM_WEBHOOK','CONNECTED',$19,CURRENT_TIMESTAMP WHERE $18::text IS NOT NULL
    ), audit AS (
      INSERT INTO "AuditLog" ("id","workspaceId","userId","actorType","action","entityType","entityId","metadata")
      SELECT gen_random_uuid()::text,$2,$20,'USER',$21,'AIEmployee',employee."id",$22::jsonb FROM employee
    ) SELECT employee."id",(SELECT "id" FROM source) AS "sourceId" FROM employee
  `,[employeeId,input.workspaceId,input.name,input.role,input.status,settingsId,input.goal,input.tone,input.instructions,JSON.stringify(input.handoffRules),sourceId,input.knowledgeTitle??null,documentId,input.knowledgeContent??null,JSON.stringify(input.chunks.map(value=>({content:value.content,label:value.sourceLabel}))),channelId,input.websiteConfigEncrypted??null,integrationId,input.crmCredentialsEncrypted??null,input.userId,input.status==="ACTIVE"?"AI_EMPLOYEE_PUBLISHED":"AI_EMPLOYEE_CREATED",JSON.stringify(input.auditMetadata)]);
  const row=rows[0] as {id:string;sourceId:string|null};return{employeeId:String(row.id),sourceId:row.sourceId?String(row.sourceId):undefined};
}

export async function getDirectAppSnapshot(workspaceId:string){
  try {
  const sql=`
    SELECT jsonb_build_object(
      'employees',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e."id",'name',e."name",'role',e."role",'status',e."status",'goal',COALESCE(s."goal",''),'tone',COALESCE(s."tone",''),'assignee',CASE WHEN m."id" IS NULL THEN NULL ELSE jsonb_build_object('id',m."id",'name',COALESCE(u."name",u."email")) END,'permissions',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',p."actionKey",'enabled',p."enabled")) FROM "ActionPermission" p WHERE p."employeeId"=e."id"),'[]'::jsonb)) ORDER BY e."createdAt") FROM "AIEmployee" e LEFT JOIN "AIEmployeeSettings" s ON s."employeeId"=e."id" LEFT JOIN "WorkspaceMember" m ON m."id"=e."assignedMemberId" LEFT JOIN "User" u ON u."id"=m."userId" WHERE e."workspaceId"=$1),'[]'::jsonb),
      'sources',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s."id",'title',s."title",'type',s."type",'status',s."status",'documents',(SELECT count(*) FROM "KnowledgeDocument" d WHERE d."sourceId"=s."id"),'createdAt',s."createdAt") ORDER BY s."createdAt" DESC) FROM "KnowledgeSource" s WHERE s."workspaceId"=$1),'[]'::jsonb),
      'conversations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c."id",'status',c."status",'channel',c."channelType",'customer',cu."name",'employee',COALESCE(e."name','—'),'createdAt',c."createdAt",'assignee',CASE WHEN wm."id" IS NULL THEN NULL ELSE jsonb_build_object('id',wm."id",'name',COALESCE(au."name",au."email")) END,'messages',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',msg."id",'direction',msg."direction",'content',msg."content",'createdAt',msg."createdAt") ORDER BY msg."createdAt") FROM "Message" msg WHERE msg."conversationId"=c."id"),'[]'::jsonb),'handoff',(SELECT jsonb_build_object('reason',h."reason",'summary',h."summary") FROM "HumanHandoff" h WHERE h."conversationId"=c."id" AND h."status"='OPEN' ORDER BY h."createdAt" DESC LIMIT 1)) ORDER BY c."updatedAt" DESC) FROM (SELECT * FROM "Conversation" WHERE "workspaceId"=$1 ORDER BY "updatedAt" DESC LIMIT 100) c JOIN "Customer" cu ON cu."id"=c."customerId" LEFT JOIN "AIEmployee" e ON e."id"=c."employeeId" LEFT JOIN "WorkspaceMember" wm ON wm."id"=c."assignedMemberId" LEFT JOIN "User" au ON au."id"=wm."userId"),'[]'::jsonb),
      'leads',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l."id",'stage',l."stage",'interest',COALESCE(l."interest",''),'customer',c."name",'phone',COALESCE(c."phone",''),'email',COALESCE(c."email",''),'createdAt',l."createdAt",'assignee',CASE WHEN wm."id" IS NULL THEN NULL ELSE jsonb_build_object('id',wm."id",'name',COALESCE(u."name",u."email")) END) ORDER BY l."createdAt" DESC) FROM "Lead" l JOIN "Customer" c ON c."id"=l."customerId" LEFT JOIN "WorkspaceMember" wm ON wm."id"=l."assignedMemberId" LEFT JOIN "User" u ON u."id"=wm."userId" WHERE l."workspaceId"=$1),'[]'::jsonb),
      'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a."id",'service',a."service",'status',a."status",'startsAt',a."startsAt",'customer',c."name") ORDER BY a."startsAt") FROM "Appointment" a JOIN "Customer" c ON c."id"=a."customerId" WHERE a."workspaceId"=$1),'[]'::jsonb),
      'customers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c."id",'name',c."name") ORDER BY c."name") FROM "Customer" c WHERE c."workspaceId"=$1),'[]'::jsonb),
      'channels',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c."id",'type',c."type",'status',c."status",'employee',COALESCE(e."name",'—'),'lastError',COALESCE(c."lastError",'')) ORDER BY c."createdAt") FROM "Channel" c LEFT JOIN "AIEmployee" e ON e."id"=c."employeeId" WHERE c."workspaceId"=$1),'[]'::jsonb),
      'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m."id",'role',m."role",'user',jsonb_build_object('id',u."id",'name',u."name",'email',u."email"))) FROM "WorkspaceMember" m JOIN "User" u ON u."id"=m."userId" WHERE m."workspaceId"=$1),'[]'::jsonb),
      'invitations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i."id",'email',i."email",'role',i."role",'expiresAt',i."expiresAt")) FROM "WorkspaceInvitation" i WHERE i."workspaceId"=$1 AND i."acceptedAt" IS NULL AND i."expiresAt">CURRENT_TIMESTAMP),'[]'::jsonb),
      'settings',COALESCE((SELECT jsonb_build_object('locale',s."locale",'timezone',s."timezone",'dataRetentionDays',s."dataRetentionDays",'analyticsEnabled',s."analyticsEnabled",'aiTrainingOptIn',s."aiTrainingOptIn",'logoUrl',COALESCE(s."logoUrl",''),'workingHours',COALESCE(s."workingHours",'{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb)) FROM "WorkspaceSettings" s WHERE s."workspaceId"=$1),jsonb_build_object('locale','ru','timezone','Europe/Moscow','dataRetentionDays',365,'analyticsEnabled',true,'aiTrainingOptIn',false,'logoUrl','','workingHours','{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb)),
      'subscription',(SELECT jsonb_build_object('plan',s."plan",'status',s."status",'currentPeriodEnd',s."currentPeriodEnd") FROM "Subscription" s WHERE s."workspaceId"=$1),
      'activity',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a."id",'action',a."action",'entityType',a."entityType",'actor',COALESCE(u."name",u."email",a."actorType"),'createdAt',a."createdAt") ORDER BY a."createdAt" DESC) FROM (SELECT * FROM "AuditLog" WHERE "workspaceId"=$1 ORDER BY "createdAt" DESC LIMIT 50) a LEFT JOIN "User" u ON u."id"=a."userId"),'[]'::jsonb),
      'analyticsEvents',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',e."type",'payload',e."payload",'createdAt',e."createdAt") ORDER BY e."createdAt") FROM "AnalyticsEvent" e WHERE e."workspaceId"=$1 AND e."createdAt">=CURRENT_TIMESTAMP-INTERVAL '365 days'),'[]'::jsonb),
      'notifications',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n."id",'type',n."type",'title',n."title",'body',n."body",'readAt',n."readAt",'createdAt',n."createdAt") ORDER BY n."createdAt" DESC) FROM (SELECT * FROM "Notification" WHERE "workspaceId"=$1 ORDER BY "createdAt" DESC LIMIT 50) n),'[]'::jsonb),
      'automations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a."id",'name',a."name",'trigger',a."trigger",'enabled',a."enabled",'steps',a."steps") ORDER BY a."createdAt" DESC) FROM "Automation" a WHERE a."workspaceId"=$1),'[]'::jsonb),
      'stats',jsonb_build_object('dialogs',(SELECT count(*) FROM "Conversation" WHERE "workspaceId"=$1),'leads',(SELECT count(*) FROM "Lead" WHERE "workspaceId"=$1),'appointments',(SELECT count(*) FROM "Appointment" WHERE "workspaceId"=$1),'handoffs',(SELECT count(*) FROM "HumanHandoff" h JOIN "Conversation" c ON c."id"=h."conversationId" WHERE c."workspaceId"=$1 AND h."status"='OPEN')),
      'usage',jsonb_build_object('messages',(SELECT count(*) FROM "Message" m JOIN "Conversation" c ON c."id"=m."conversationId" WHERE c."workspaceId"=$1),'conversations',(SELECT count(*) FROM "Conversation" WHERE "workspaceId"=$1),'actions',(SELECT count(*) FROM "ActionExecution" x JOIN "AIEmployee" e ON e."id"=x."employeeId" WHERE e."workspaceId"=$1),'aiUsage',(SELECT count(*) FROM "AnalyticsEvent" WHERE "workspaceId"=$1 AND "type"='AI_RESPONSE'),'knowledgeBytes',(SELECT COALESCE(sum(octet_length(d."content")),0) FROM "KnowledgeDocument" d JOIN "KnowledgeSource" s ON s."id"=d."sourceId" WHERE s."workspaceId"=$1),'activeEmployees',(SELECT count(*) FROM "AIEmployee" WHERE "workspaceId"=$1 AND "status"='ACTIVE'))
    ) AS snapshot
  `;
  const rows=await client().query(sql.replace(`e."name',`,`e."name",`),[workspaceId]);
  return (rows[0] as {snapshot:Record<string,unknown>}).snapshot;
  } catch(error) {
    const value=error as Error&{code?:unknown;detail?:unknown;hint?:unknown;position?:unknown;severity?:unknown;cause?:unknown};
    console.error(`DIRECT_APP_SNAPSHOT_QUERY_FAILED ${JSON.stringify({
      name:value?.name,
      message:value?.message,
      code:value?.code,
      detail:value?.detail,
      hint:value?.hint,
      position:value?.position,
      severity:value?.severity,
      cause:value?.cause instanceof Error?{name:value.cause.name,message:value.cause.message}:value?.cause,
    })}`);
    throw new Error("DIRECT_APP_SNAPSHOT_QUERY_FAILED");
  }
}
