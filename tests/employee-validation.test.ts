import assert from "node:assert/strict";
import test from "node:test";
import { employeeSchema } from "../src/lib/validation/employee.ts";
import { employeeRoleLabel, employeeToneLabel } from "../src/lib/employee-domain.ts";

test("employee validation normalizes legacy labels to stable business keys and rejects unknown roles",()=>{
  const expected=["ADMINISTRATOR","SALES","SUPPORT"];
  for(const [index,role] of ["Администратор","Менеджер продаж","Поддержка"].entries()){
    const parsed=employeeSchema.safeParse({name:"Lemiri",role,goal:"Помогать клиентам компании",tone:"Дружелюбный"});
    assert.equal(parsed.success,true);if(parsed.success){assert.equal(parsed.data.role,expected[index]);assert.equal(parsed.data.tone,"FRIENDLY")}
  }
  assert.equal(employeeSchema.safeParse({name:"Lemiri",role:"SALES",goal:"Помогать клиентам компании",tone:"WARM_PROFESSIONAL"}).success,true);
  assert.equal(employeeSchema.safeParse({name:"Lemiri",role:"LLM agent",goal:"Помогать клиентам компании",tone:"Дружелюбный"}).success,false);
});

test("stable employee keys are rendered as localized business language",()=>{
  assert.equal(employeeRoleLabel("SALES","ru"),"Менеджер продаж");
  assert.equal(employeeRoleLabel("SALES","en"),"Sales manager");
  assert.equal(employeeToneLabel("WARM_PROFESSIONAL","ru"),"Тёплый и профессиональный");
  assert.equal(employeeToneLabel("FRIENDLY","en"),"Friendly");
});
