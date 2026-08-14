export function isUniqueConstraintError(error: unknown): error is { code: "P2002" | "23505" } {
  if(typeof error!=="object"||error===null)return false;
  const record=error as {code?:unknown;cause?:unknown};
  if(record.code==="P2002"||record.code==="23505")return true;
  return typeof record.cause==="object"&&record.cause!==null&&"code" in record.cause&&(record.cause as {code?:unknown}).code==="23505";
}
