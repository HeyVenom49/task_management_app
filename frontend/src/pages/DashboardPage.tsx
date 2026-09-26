import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import { useForm } from "../hooks/useForm";
import { TextArea } from "../components/ui/TextArea";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { Spinner } from "../components/ui/Spinner";
import { ProjectRow } from "../components/ProjectRow";
import { createProject, listProjects } from "../api/projects";
import type { Project } from "../types/project";
import styles from "./DashboardPage.module.css";

type CreateFormValues = { info: string };
type LoadState = "loading" | "loaded" | "error";

type FetchResult = { ok: true; projects: Project[] } | { ok: false };

// Plain helper with no setState calls, so it can be invoked from inside the effect
// below via an inline `.then()` without tripping the set-state-in-effect lint rule
// (which flags calling a function that itself synchronously calls setState from
// within an effect body). See ProjectPage.tsx / ProjectTasksPage.tsx for the same pattern.
async function fetchProjectsData(): Promise<FetchResult> {
  try {
    const result = await listProjects();
    return { ok: true, projects: result.projects };
  } catch {
    return { ok: false };
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProjectsData().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setProjects(result.projects);
        setState("loaded");
      } else {
        setState("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function retry(): void {
    setState("loading");
    fetchProjectsData().then((result) => {
      if (result.ok) {
        setProjects(result.projects);
        setState("loaded");
      } else {
        setState("error");
      }
    });
  }

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<CreateFormValues>({
      initialValues: { info: "" },
      validators: {
        info: (value) =>
          value.trim().length === 0 ? "Info is required" : value.length > 500 ? "Info must be 500 characters or fewer" : undefined,
      },
      async onSubmit(formValues) {
        const result = await createProject(formValues.info.trim());
        setProjects((prev) => [result.project, ...prev]);
        setIsCreating(false);
      },
    });

  return (
    <AppShell>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>Your projects</h1>
        {!isCreating && (
          <Button variant="primary" onClick={() => setIsCreating(true)}>
            New project
          </Button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className={styles.createForm}>
          {formError && <FormBanner variant="error">{formError}</FormBanner>}
          <TextArea
            label="What's this project about?"
            value={values.info}
            error={errors.info}
            onChange={(event) => handleChange("info", event.target.value)}
            onBlur={() => handleBlur("info")}
          />
          <div className={styles.createActions}>
            <Button type="button" variant="secondary" onClick={() => setIsCreating(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Create project
            </Button>
          </div>
        </form>
      )}

      {state === "loading" && <Spinner label="Loading projects" />}

      {state === "error" && (
        <div>
          <FormBanner variant="error">Something went wrong loading your projects.</FormBanner>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {state === "loaded" && projects.length === 0 && (
        <div className={styles.empty}>
          <p>No projects yet</p>
          <p className={styles.detail}>Start with one quiet place for your team’s work. You can invite people after you create it.</p>
        </div>
      )}

      {state === "loaded" && projects.length > 0 && (
        <div className={styles.list}>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} isCreator={project.creatorId === user?.id} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
