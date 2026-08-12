import assert from "node:assert/strict";
import test from "node:test";
import { selectActiveMembership } from "../src/lib/auth/workspace.ts";

test("active workspace can only be selected from the user's memberships",()=>{const memberships=[{workspaceId:"workspace-a",role:"OWNER"},{workspaceId:"workspace-b",role:"VIEWER"}];assert.equal(selectActiveMembership(memberships,"workspace-b")?.workspaceId,"workspace-b");assert.equal(selectActiveMembership(memberships,"foreign-workspace")?.workspaceId,"workspace-a");assert.equal(selectActiveMembership([],"workspace-a"),undefined)});
