import { TelegramConnector } from "./telegram";
import { WebsiteConnector } from "./website";
import { WhatsAppConnector } from "./whatsapp";
import { EmailConnector } from "./email";
import type { ChannelConnector } from "./types";
const connectors=new Map<string,ChannelConnector<any>>([["WEBSITE",new WebsiteConnector()],["TELEGRAM",new TelegramConnector()],["WHATSAPP",new WhatsAppConnector()],["EMAIL",new EmailConnector()]]);
export function getConnector(type:string){const connector=connectors.get(type.toUpperCase());if(!connector)throw new Error(`Unsupported connector: ${type}`);return connector}
export const supportedConnectors=[{type:"WEBSITE",name:"Чат на сайте",availability:"READY"},{type:"TELEGRAM",name:"Telegram",availability:"READY"},{type:"WHATSAPP",name:"WhatsApp",availability:"READY"},{type:"EMAIL",name:"Email",availability:"READY"}] as const;
