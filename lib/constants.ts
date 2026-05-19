export const ROLES = { ADMIN: "ADMIN", MANAGER: "MANAGER", REP: "REP" } as const
export type Role = typeof ROLES[keyof typeof ROLES]
export const PRIVILEGED_ROLES: Role[] = [ROLES.ADMIN, ROLES.MANAGER]
export function isPrivileged(role: string): boolean {
  return PRIVILEGED_ROLES.includes(role as Role)
}
export function isAdmin(role: string): boolean {
  return role === ROLES.ADMIN
}

export const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "TASK"] as const
export type ActivityType = typeof ACTIVITY_TYPES[number]
