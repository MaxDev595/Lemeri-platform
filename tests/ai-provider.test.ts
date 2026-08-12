import assert from "node:assert/strict";
import test from "node:test";
import { MockAIProvider } from "../src/lib/ai/providers/mock.ts";

const base = { employeeName: "Lemiri", role: "Администратор", goal: "Помогать клиентам", tone: "Тёплый", messages: [{ role: "user" as const, content: "Сколько стоит консультация?" }] };

test("provider hands off instead of inventing without knowledge", async () => {
  const result = await new MockAIProvider().generateResponse({ ...base, knowledge: [] });
  assert.ok(result.handoffReason);
  assert.equal(result.usedSourceIds.length, 0);
  assert.ok(result.confidence < .5);
});

test("provider cites relevant knowledge", async () => {
  const result = await new MockAIProvider().generateResponse({ ...base, knowledge: [{ id: "chunk-1", content: "Первичная консультация стоит 3 000 ₽.", sourceLabel: "Прайс", score: .8 }] });
  assert.deepEqual(result.usedSourceIds, ["chunk-1"]);
  assert.match(result.text, /3 000/);
  assert.equal(result.handoffReason, undefined);
});
