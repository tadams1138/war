// The roles Gherkin steps name with the {role} parameter type
// (steps/parameters.ts), as the flags GET /auth/me reports for them. Add a role
// here.
export interface RoleFlags {
  is_moderator?: boolean
  is_admin?: boolean
}

export const ROLES: Record<string, RoleFlags> = {
  voter: {},
  Moderator: { is_moderator: true },
  Admin: { is_admin: true },
}
