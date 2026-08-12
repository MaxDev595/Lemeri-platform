import { z } from "zod";
import type { ChannelConnector } from "./types";

type WebsiteConfig={allowedOrigins:string[]};

export class WebsiteConnector implements ChannelConnector<WebsiteConfig>{
  readonly type="WEBSITE";
  validateConfig(value:unknown){const parsed=z.object({allowedOrigins:z.array(z.string().url()).max(20).default([])}).parse(value);return{allowedOrigins:[...new Set(parsed.allowedOrigins.map(item=>new URL(item).origin))]}}
  async verifyConnection(){return{ok:true,externalId:"embedded-widget",displayName:"Чат на сайте"}}
  verifyWebhook(){return true}
  parseWebhook(){return[]}
  async sendMessage():Promise<{externalMessageId:string}>{throw new Error("Website messages are returned over the widget API")}
}
