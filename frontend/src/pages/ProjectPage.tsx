import { useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { Tabs } from "../components/ui/Tabs";
import { Spinner } from "../components/ui/Spinner";
import { FormBanner } from "../components/ui/FormBanner";
import { Button } from "../components/ui/Button";
import { ApiError } from "../api/client";
import { getProject, listMembers } from "../api/projects";
import { findOwnMembership } from "../utils/membership";
import type { MemberWithUser, Project } from "../types/project";
import styles from "./ProjectPage.module.css";

export type ProjectOutletContext = {
  project: Project;
  members: MemberWithUser[];
  membership: MemberWithUser;
  refreshMembers: () => Promise<void>;
  refreshProject: () => Promise<void>;
};

type LoadState = "loading" | "loaded" | "not-found" | "error";

type FetchResult =
  | { ok: true; project: Project; members: MemberWithUser[] }
  | { ok: false; notFound: boolean };

// Plain helper with no setState calls, so it can be invoked from inside the effect
// below via an inline `.then()` without tripping the set-state-in-effect lint rule
// (which flags calling a function that itself synchronously calls setState from
// within an effect body). See VerifyEmailPage.tsx for the same pattern.
async function fetchProjectData(id: string): Promise<FetchResult> {
  try {
    const [projectResult, membersResult] = await Promise.all([getProject(id), listMembers(id)]);
    return { ok: true, project: projectResult.project, members: membersResult.members };
  } catch (err) {
    const notFound = err instanceof ApiError && (err.status === 403 || err.status === 400);
    return { ok: false, notFound };
  }
}

function NotFound() {
  return (
    <AppShell>
      <div className={styles.notFound}>
        <p>Project not found.</p>
        <Link to="/">Back to dashboard</Link>
      </div>
    </AppShell>
  );
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchProjectData(id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setProject(result.project);
        setMembers(result.members);
        setState("loaded");
      } else {
        setState(result.notFound ? "not-found" : "error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function retry(): void {
    if (!id) return;
    setState("loading");
    fetchProjectData(id).then((result) => {
      if (result.ok) {
        setProject(result.project);
        setMembers(result.members);
        setState("loaded");
      } else {
        setState(result.notFound ? "not-found" : "error");
      }
    });
  }

  async function refreshMembers(): Promise<void> {
    if (!id) return;
    const result = await listMembers(id);
    setMembers(result.members);
  }

  async function refreshProject(): Promise<void> {
    if (!id) return;
    const result = await getProject(id);
    setProject(result.project);
  }

  if (state === "loading") {
    return <Spinner label="Loading project" fullPage />;
  }

  if (state === "not-found") {
    return <NotFound />;
  }

  if (state === "error" || !project) {
    return (
      <AppShell>
        <FormBanner variant="error">Something went wrong loading this project.</FormBanner>
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      </AppShell>
    );
  }

  const membership = user ? findOwnMembership(members, user.id) : null;
  if (!membership) {
    return <NotFound />;
  }

  const tabs = [
    { to: `/projects/${project.id}/tasks`, label: "Tasks" },
    { to: `/projects/${project.id}/members`, label: "Members" },
  ];
  if (membership.role === "OWNER") {
    tabs.push({ to: `/projects/${project.id}/settings`, label: "Settings" });
  }

  const context: ProjectOutletContext = { project, members, membership, refreshMembers, refreshProject };

  return (
    <AppShell>
      <header className={styles.header}>
        <h1 className={styles.title} title={project.info}>
          {project.info}
        </h1>
        <span className={styles.roleBadge}>{membership.role === "OWNER" ? "Owner" : "Member"}</span>
        <span className={styles.memberCount}>
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </header>
      <Tabs items={tabs} />
      <div className={styles.tabContent}>
        <Outlet context={context} />
      </div>
    </AppShell>
  );
}
