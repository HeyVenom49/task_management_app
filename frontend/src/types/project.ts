export type MemberRole = "OWNER" | "MEMBER";
export type MemberStatus = "ACTIVE" | "INACTIVE";

export type Project = {
  id: string;
  creatorId: string;
  info: string;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  userId: string;
  projectId: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
};

export type MemberWithUser = Member & {
  name: string;
  email: string;
};
