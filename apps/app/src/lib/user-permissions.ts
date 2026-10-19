// Which roles each role may manage (reset password, deactivate/reactivate)
// within its own customer. Access managers themselves are managed by the
// super admin in the admin portal.
export const MANAGEABLE_ROLES: Record<string, readonly string[]> = {
  access_manager: ['admin', 'user'],
  admin: ['user'],
};

type Actor = { id: string; role: string };
type Target = { id: string; role: string };

export function canManage(actor: Actor, target: Target): boolean {
  return actor.id !== target.id && (MANAGEABLE_ROLES[actor.role]?.includes(target.role) ?? false);
}

/**
 * Editing profile info (name, department, email) within the same customer:
 * access managers can edit anyone, admins can edit users and themselves,
 * everyone can edit themselves.
 */
export function canEditProfile(actor: Actor, target: Target): boolean {
  if (actor.id === target.id) return true;
  if (actor.role === 'access_manager') return true;
  if (actor.role === 'admin') return target.role === 'user';
  return false;
}

/**
 * Email is the login identity: managers can change other people's, but only
 * an access manager (nobody above them in this portal) can change their own.
 */
export function canEditEmail(actor: Actor, target: Target): boolean {
  if (!canEditProfile(actor, target)) return false;
  return actor.id !== target.id || actor.role === 'access_manager';
}

/** Only access managers may change roles, and only between admin and user. */
export const ASSIGNABLE_ROLES = ['admin', 'user'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function canChangeRole(actor: Actor, target: Target): boolean {
  return actor.role === 'access_manager' && actor.id !== target.id && target.role !== 'access_manager';
}

/** Role a pending request may be approved as. */
export function approvableRoles(actorRole: string): readonly AssignableRole[] {
  return actorRole === 'access_manager' ? ASSIGNABLE_ROLES : ['user'];
}
