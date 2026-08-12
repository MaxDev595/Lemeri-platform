import { createHmac, timingSafeEqual } from "node:crypto";

type WidgetTokenPayload={employeeId:string;origin:string;expiresAt:number};

function secret(){const value=process.env.CREDENTIALS_ENCRYPTION_KEY;if(!value&&process.env.NODE_ENV==="production")throw new Error("CREDENTIALS_ENCRYPTION_KEY is required");return value??"lemiri-development-key-change-me"}
function signature(payload:string){return createHmac("sha256",secret()).update(`lemiri-widget-v1:${payload}`).digest("base64url")}

export function createWidgetToken(payload:WidgetTokenPayload){const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");return `${encoded}.${signature(encoded)}`}
export function verifyWidgetToken(token:string,employeeId:string,origin:string,now=Date.now()){
  const [payload,provided]=token.split(".");if(!payload||!provided)return false;const expected=signature(payload);const a=Buffer.from(provided);const b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return false;
  try{const value=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as WidgetTokenPayload;return value.employeeId===employeeId&&(value.origin==="*"||value.origin===origin)&&value.expiresAt>=now}catch{return false}
}
