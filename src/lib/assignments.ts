export type AssignmentEntityType="EMPLOYEE"|"CONVERSATION"|"LEAD";
export function canReceiveAssignment(role:string){return role==="OWNER"||role==="ADMIN"||role==="MANAGER"}
