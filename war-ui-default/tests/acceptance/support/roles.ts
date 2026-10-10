// The roles Gherkin steps name with the {role} parameter type
// (steps/parameters.ts), as the flags GET /auth/me reports for them. "Staff
// member" is any Staff (a Moderator or an Admin); the steps that say it need
// no more than that, so it is signed in as a Moderator. Add a role here.
export interface RoleFlags {
  is_moderator?: boolean
  is_admin?: boolean
}

export const ROLES: Record<string, RoleFlags> = {
  voter: {},
  'Staff member': { is_moderator: true },
  Moderator: { is_moderator: true },
  Admin: { is_admin: true },
}
