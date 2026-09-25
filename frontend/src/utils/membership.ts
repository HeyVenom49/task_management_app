import type { MemberWithUser } from "../types/project";

export function findOwnMembership(members: MemberWithUser[], userId: string): MemberWithUser | null {
  return members.find((member) => member.userId === userId) ?? null;
}
