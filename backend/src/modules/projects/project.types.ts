export type Project = {
  id: string;
  creatorId: string;
  info: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProjectInput = {
  creatorId: string;
  info: string;
};

export type UpdateProjectInput = {
  info: string;
};

export type MemberRole = "OWNER" | "MEMBER";
export type MemberStatus = "ACTIVE" | "INACTIVE";

export type Member = {
  id: string;
  userId: string;
  projectId: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type MemberWithUser = Member & {
  name: string;
  email: string;
};

export type CreateMemberInput = {
  userId: string;
  projectId: string;
  role: MemberRole;
  status?: MemberStatus;
};
