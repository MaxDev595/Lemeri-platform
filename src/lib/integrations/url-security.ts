import { isIP } from "node:net";
function privateIp(address:string){const value=address.replace(/^\[|\]$/g,"").toLowerCase();if(value==="::1"||value==="::"||value.startsWith("fc")||value.startsWith("fd")||value.startsWith("fe80:")||value.startsWith("::ffff:"))return true;if(!isIP(value))return true;const parts=value.split(".").map(Number);return isIP(value)===4&&(parts[0]===10||parts[0]===127||parts[0]===0||parts[0]===169&&parts[1]===254||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168||parts[0]===100&&parts[1]>=64&&parts[1]<=127)}
function privateHostname(hostname:string){const host=hostname.toLowerCase().replace(/\.$/,"");return host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||!host.includes(".")&&!isIP(host)}
// Cloudflare Workers: dns.lookup goes through DNS-over-HTTPS and can fail for
// valid hosts, while the Worker's own fetch cannot reach private networks at all.
// There the literal hostname/IP checks below are the guard; DNS is skipped.
const inCloudflareWorker=typeof navigator!=="undefined"&&navigator.userAgent==="Cloudflare-Workers";
async function resolveAddresses(hostname:string):Promise<string[]|null>{
  if(inCloudflareWorker)return null;
  try{const { lookup }=await import("node:dns/promises");return (await lookup(hostname,{all:true})).map(record=>record.address)}
  catch(error){
    const code=(error as {code?:string})?.code;
    if(code==="ENOTFOUND"||code==="EAI_AGAIN"||code==="ENODATA")throw new Error("CRM endpoint host does not resolve");
    // Any other failure means the runtime has no usable resolver.
    return null;
  }
}
export async function assertPublicHttpsUrl(value:string){const url=new URL(value);
// Local development only: lets a CRM receiver on this machine be tested end to end.
if(process.env.NODE_ENV!=="production"&&process.env.LEMIRI_ALLOW_PRIVATE_WEBHOOKS==="true")return url;
if(url.protocol!=="https:"||url.username||url.password||url.port)throw new Error("CRM endpoint must be a public HTTPS URL without credentials or custom port");
const host=url.hostname.replace(/^\[|\]$/g,"");
if(isIP(host)?privateIp(host):privateHostname(host))throw new Error("CRM endpoint resolves to a private or invalid address");
if(!isIP(host)){const addresses=await resolveAddresses(host);if(addresses&&(!addresses.length||addresses.some(privateIp)))throw new Error("CRM endpoint resolves to a private or invalid address")}
return url}
