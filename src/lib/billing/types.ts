export type PaidPlan = "STARTER" | "CUSTOM";
export type BillingCheckout={workspaceId:string;email:string;priceId:string;plan:PaidPlan;successUrl:string;cancelUrl:string};
export interface BillingProvider{createCheckout(input:BillingCheckout):Promise<{id:string;url:string}>}
/** @deprecated Use billingPlans from ./plans. Kept for older imports. */
export { billingPlans as plans } from "./plans";
