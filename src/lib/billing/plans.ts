export const billingPlans={
  TRIAL:{key:"TRIAL",name:"Пробный",conversationLimit:100,employeeLimit:1},
  START:{key:"START",name:"Старт",conversationLimit:1000,employeeLimit:2},
  GROWTH:{key:"GROWTH",name:"Рост",conversationLimit:5000,employeeLimit:10},
} as const;

export type BillingPlanKey=keyof typeof billingPlans;
export function getBillingPlan(value:string){return billingPlans[value as BillingPlanKey]??billingPlans.TRIAL}
export function effectivePlan(plan:string|null|undefined,status:string|null|undefined):BillingPlanKey{
  if(status!=="ACTIVE"&&status!=="TRIALING")return "TRIAL";
  return getBillingPlan(plan??"TRIAL").key;
}
export function canActivateEmployee(activeEmployees:number,plan:BillingPlanKey){return activeEmployees<getBillingPlan(plan).employeeLimit}
export function canCreateConversation(monthlyConversations:number,plan:BillingPlanKey){return monthlyConversations<getBillingPlan(plan).conversationLimit}
