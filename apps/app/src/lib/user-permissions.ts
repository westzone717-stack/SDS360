// Which roles each role may manage (reset password, deactivate/reactivate)
// within its own customer. Access managers themselves are managed by the
// super admin in the admin portal.
export const MANAGEABLE_ROLES: Record<string, readonly string[]> = {
  access_manager: ['admin', 'user'],
  admin: ['user'],
};

export function canManage(
  actor: { id: string; role: string },
  target: { id: string; role: string }
): boolean {
  return actor.id !== target.id && (MANAGEABLE_ROLES[actor.role]?.includes(target.role) ?? false);
}
