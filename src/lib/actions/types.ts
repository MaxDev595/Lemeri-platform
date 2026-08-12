import type { z } from "zod";
export type ActionContext={workspaceId:string;employeeId:string;conversationId?:string};
export interface AIAction<T extends z.ZodTypeAny=z.ZodTypeAny>{key:string;name:string;description:string;schema:T;execute(context:ActionContext,input:z.infer<T>):Promise<unknown>}
