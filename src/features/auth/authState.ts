export type Assurance = string | null;
export type Access = "signed-out" | "enroll" | "verify" | "ready";
export function decideAccess(
  hasSession: boolean,
  current: Assurance,
  next: Assurance,
): Access {
  if (!hasSession) return "signed-out";
  // A stale aal2 JWT after factor removal must not open dashboard queries.
  if (current === "aal2" && next === "aal2") return "ready";
  if (current !== "aal1" && current !== "aal2") return "signed-out";
  return next === "aal2" ? "verify" : "enroll";
}
