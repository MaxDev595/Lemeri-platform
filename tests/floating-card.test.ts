import assert from "node:assert/strict";
import test from "node:test";
import { floatingCardRuntime } from "../src/lib/floating-card/runtime.ts";

const rt = floatingCardRuntime();
const vp = { w: 1440, h: 900 };
const base = { ...rt.defaults };

test("docked card follows the viewport corner", () => {
  const r = rt.resolveRect({ ...base, dockX: "right", dockY: "bottom", w: 400, h: 600 }, vp);
  assert.deepEqual(r, { x: 1440 - 400 - 16, y: 900 - 600 - 16, w: 400, h: 600 });
  const small = rt.resolveRect({ ...base, dockX: "right", dockY: "bottom", w: 400, h: 600 }, { w: 800, h: 500 });
  assert.equal(small.h, 500 - 32);
});

test("dropping near an edge or corner docks the card", () => {
  assert.deepEqual(rt.dockFor({ x: 30, y: 400, w: 400, h: 300 }, vp), { dockX: "left", dockY: null });
  assert.deepEqual(rt.dockFor({ x: 1020, y: 580, w: 400, h: 300 }, vp), { dockX: "right", dockY: "bottom" });
  assert.deepEqual(rt.dockFor({ x: 500, y: 200, w: 400, h: 300 }, vp), { dockX: null, dockY: null });
});

test("closing a docked card keeps the launcher on that edge or corner", () => {
  assert.deepEqual(rt.launcherFromCard({ ...base, dockX: "left", dockY: "top" }, vp), { launcherEdge: "left", launcherOffset: 0 });
  const side = rt.launcherFromCard({ ...base, dockX: "right", dockY: null, y: 200, h: 400 }, vp);
  assert.equal(side.launcherEdge, "right"); assert.equal(side.launcherOffset, 400 / 900);
});

test("closing a free-floating card attaches the launcher to the nearest edge", () => {
  const top = rt.launcherFromCard({ ...base, dockX: null, dockY: null, x: 500, y: 20, w: 400, h: 380 }, vp);
  assert.equal(top.launcherEdge, "top");
  const left = rt.launcherFromCard({ ...base, dockX: null, dockY: null, x: 60, y: 250, w: 340, h: 400 }, vp);
  assert.equal(left.launcherEdge, "left");
  const pos = rt.launcherPosition("left", left.launcherOffset, vp);
  assert.equal(pos.x, 16); assert.equal(pos.y + 28, 450);
});

test("launcher never leaves the screen and card reopens next to a moved launcher", () => {
  assert.deepEqual(rt.launcherPosition("bottom", 5, vp), { x: 1440 - 16 - 56, y: 900 - 16 - 56 });
  const opened = rt.cardFromLauncher({ ...base, launcherEdge: "left", launcherOffset: 0.5, w: 400, h: 500 }, vp);
  assert.equal(opened.dockX, "left"); assert.equal(opened.dockY, null); assert.equal(opened.y, 450 - 250);
  const corner = rt.cardFromLauncher({ ...base, launcherEdge: "top", launcherOffset: 0.99, w: 400, h: 500 }, vp);
  assert.equal(corner.dockY, "top"); assert.equal(corner.dockX, "right");
});

test("resizing respects minimum size and screen bounds on every side", () => {
  const start = { x: 600, y: 200, w: 400, h: 500 };
  assert.deepEqual(rt.resizeRect(start, "w", -1000, 0, vp), { x: 16, y: 200, w: 984, h: 500 });
  assert.deepEqual(rt.resizeRect(start, "ne", 5000, 300, vp), { x: 600, y: 320, w: 824, h: 380 });
  assert.deepEqual(rt.resizeRect(start, "s", 0, -1000, vp), { x: 600, y: 200, w: 400, h: 380 });
});

test("stored layout is sanitized and the runtime is shippable as source text", () => {
  assert.deepEqual(rt.sanitize({ x: "1", dockX: "middle", open: true, launcherEdge: "top" }), { open: true, launcherEdge: "top" });
  const clone = new Function(`return (${floatingCardRuntime.toString()})()`)() as typeof rt;
  assert.equal(clone.nearestEdge(5, 450, vp), "left");
});
