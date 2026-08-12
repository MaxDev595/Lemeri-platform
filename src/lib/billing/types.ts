export type BillingCheckout={workspaceId:string;email:string;priceId:string;plan:"START"|"GROWTH";successUrl:string;cancelUrl:string};
export interface BillingProvider{createCheckout(input:BillingCheckout):Promise<{id:string;url:string}>}
export const plans={TRIAL:{name:"Пробный",dialogs:100,employees:1},START:{name:"Старт",dialogs:1000,employees:2},GROWTH:{name:"Рост",dialogs:5000,employees:10}} as const;
