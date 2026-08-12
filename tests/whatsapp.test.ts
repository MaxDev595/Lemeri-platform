import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WhatsAppConnector } from "../src/lib/connectors/whatsapp.ts";
const config={accessToken:"x".repeat(30),phoneNumberId:"123456",verifyToken:"verify-token-123456",appSecret:"app-secret-123456"};
test("WhatsApp verifies Meta signature and normalizes text messages",()=>{const connector=new WhatsAppConnector();const raw=JSON.stringify({entry:[{changes:[{value:{contacts:[{wa_id:"77001234567",profile:{name:"Айжан"}}],messages:[{id:"wamid.1",from:"77001234567",timestamp:"1700000000",type:"text",text:{body:"Здравствуйте"}}]}}]}]});const signature=`sha256=${createHmac("sha256",config.appSecret).update(raw).digest("hex")}`;assert.equal(connector.verifyWebhook(raw,new Headers({"x-hub-signature-256":signature}),config),true);const [message]=connector.parseWebhook(JSON.parse(raw));assert.equal(message.senderName,"Айжан");assert.equal(message.text,"Здравствуйте");assert.equal(message.externalMessageId,"wamid.1")});
