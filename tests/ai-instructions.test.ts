import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIProvider } from "../src/lib/ai/providers/openai.ts";

test("OpenAI provider receives business instructions and handoff rules",async()=>{
  let requestBody="";
  const fetcher=async(_input:RequestInfo|URL,init?:RequestInit)=>{requestBody=String(init?.body??"");return new Response(JSON.stringify({output:[{content:[{type:"output_text",text:JSON.stringify({text:"ok",confidence:.8,usedSourceIds:[],handoffReason:null,actionRequest:null})}]}]}),{status:200})};
  const provider=new OpenAIProvider("test","test-model",fetcher as typeof fetch);
  await provider.generateResponse({employeeName:"Lemiri",role:"support",goal:"help",tone:"warm",instructions:"Do not promise discounts",handoffRules:{complaint:true},messages:[{role:"user",content:"hello"}],knowledge:[]});
  const body=JSON.parse(requestBody) as {instructions:string};assert.match(body.instructions,/Do not promise discounts/);assert.match(body.instructions,/complaint/);
});
