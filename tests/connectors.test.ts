import assert from "node:assert/strict";
import test from "node:test";
import { encryptCredentials, decryptCredentials } from "../src/lib/security/encryption.ts";
import { TelegramConnector } from "../src/lib/connectors/telegram.ts";

test("connector credentials use authenticated encryption", () => {
  const encrypted=encryptCredentials({botToken:"secret",webhookSecret:"another-secret"});
  assert.equal(encrypted.includes("secret"),false);
  assert.deepEqual(decryptCredentials(encrypted),{botToken:"secret",webhookSecret:"another-secret"});
  const tampered=`${encrypted.slice(0,-1)}${encrypted.endsWith("a")?"b":"a"}`;
  assert.throws(()=>decryptCredentials(tampered));
});

test("telegram webhook secret is verified and message is normalized", () => {
  const connector=new TelegramConnector();
  const config={botToken:"123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",webhookSecret:"sixteen-char-secret"};
  assert.equal(connector.verifyWebhook("",new Headers({"x-telegram-bot-api-secret-token":config.webhookSecret}),config),true);
  assert.equal(connector.verifyWebhook("",new Headers({"x-telegram-bot-api-secret-token":"wrong-secret-value"}),config),false);
  const messages=connector.parseWebhook({update_id:7,message:{message_id:8,date:1700000000,text:"Здравствуйте",chat:{id:42},from:{id:43,first_name:"Анна"}}});
  assert.equal(messages.length,1);assert.equal(messages[0]?.senderName,"Анна");assert.equal(messages[0]?.text,"Здравствуйте");
});
