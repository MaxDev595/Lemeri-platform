import type { Locale } from "@/lib/i18n";

export const employeeRoleKeys=["ADMINISTRATOR","SALES","SUPPORT"] as const;
export const employeeToneKeys=["WARM_PROFESSIONAL","CONCISE_BUSINESS","FRIENDLY"] as const;
export type EmployeeRoleKey=(typeof employeeRoleKeys)[number];
export type EmployeeToneKey=(typeof employeeToneKeys)[number];

const legacyRoles:Record<string,EmployeeRoleKey>={"Администратор":"ADMINISTRATOR","Менеджер продаж":"SALES","Поддержка":"SUPPORT"};
const legacyTones:Record<string,EmployeeToneKey>={"Тёплый и профессиональный":"WARM_PROFESSIONAL","Краткий и деловой":"CONCISE_BUSINESS","Дружелюбный":"FRIENDLY"};
export function normalizeEmployeeRole(value:unknown){return typeof value==="string"?(legacyRoles[value]??value):value}
export function normalizeEmployeeTone(value:unknown){return typeof value==="string"?(legacyTones[value]??value):value}
export function employeeRoleLabel(value:string,locale:Locale){const key=legacyRoles[value]??value;return locale==="en"?(key==="ADMINISTRATOR"?"Administrator":key==="SALES"?"Sales manager":key==="SUPPORT"?"Support":value):(key==="ADMINISTRATOR"?"Администратор":key==="SALES"?"Менеджер продаж":key==="SUPPORT"?"Поддержка":value)}
export function employeeToneLabel(value:string,locale:Locale){const key=legacyTones[value]??value;return locale==="en"?(key==="WARM_PROFESSIONAL"?"Warm and professional":key==="CONCISE_BUSINESS"?"Concise and businesslike":key==="FRIENDLY"?"Friendly":value):(key==="WARM_PROFESSIONAL"?"Тёплый и профессиональный":key==="CONCISE_BUSINESS"?"Краткий и деловой":key==="FRIENDLY"?"Дружелюбный":value)}
