import assert from "node:assert/strict";
import test from "node:test";
import { GroqProvider } from "../src/lib/ai/providers/groq.ts";

test("Groq provider uses GPT-OSS reasoning and validates structured output",async()=>{
  let requestBody:Record<string,unknown>|undefined;
  const payload={text:"Стоимость 3000",confidence:.9,usedSourceIds:["chunk-1"],handoffReason:null,actionRequest:null};
  const fetcher=async(_url:string|URL|Request,init?:RequestInit)=>{requestBody=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}),{status:200})};
  const provider=new GroqProvider("test-key","openai/gpt-oss-120b",fetcher as typeof fetch);
  const result=await provider.generateResponse({employeeName:"Lemiri",role:"sales",goal:"help",tone:"warm",messages:[{role:"user",content:"price?"}],knowledge:[{id:"chunk-1",content:"Стоимость 3000",sourceLabel:"Price",score:.9}]});
  assert.equal(requestBody?.model,"openai/gpt-oss-120b");
  assert.equal(requestBody?.reasoning_effort,"medium");
  assert.equal(requestBody?.max_completion_tokens,2048);
  assert.equal((requestBody?.response_format as {type:string}).type,"json_schema");
  assert.deepEqual(result.usedSourceIds,["chunk-1"]);
});

test("Groq provider rejects unknown knowledge citations",async()=>{
  const payload={text:"Invented",confidence:.9,usedSourceIds:["unknown"],handoffReason:null,actionRequest:null};
  const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]}),{status:200});
  const provider=new GroqProvider("test-key","openai/gpt-oss-120b",fetcher as typeof fetch);
  await assert.rejects(()=>provider.generateResponse({employeeName:"Lemiri",role:"sales",goal:"help",tone:"warm",messages:[{role:"user",content:"price?"}],knowledge:[]}),/unknown knowledge source id/);
});
