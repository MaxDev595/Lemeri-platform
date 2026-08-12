import { z } from "zod";
const roles=["ADMINISTRATOR","SALES","SUPPORT"] as const;const tones=["WARM_PROFESSIONAL","CONCISE_BUSINESS","FRIENDLY"] as const;
const legacyRoles:Record<string,(typeof roles)[number]>={"Администратор":"ADMINISTRATOR","Менеджер продаж":"SALES","Поддержка":"SUPPORT"};const legacyTones:Record<string,(typeof tones)[number]>={"Тёплый и профессиональный":"WARM_PROFESSIONAL","Краткий и деловой":"CONCISE_BUSINESS","Дружелюбный":"FRIENDLY"};
export const employeeSchema=z.object({name:z.string().trim().min(2).max(60),role:z.preprocess(value=>typeof value==="string"?(legacyRoles[value]??value):value,z.enum(roles)),goal:z.string().trim().min(10).max(500),tone:z.preprocess(value=>typeof value==="string"?(legacyTones[value]??value):value,z.enum(tones))});
