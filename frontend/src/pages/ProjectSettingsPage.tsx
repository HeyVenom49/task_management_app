import { useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import { deleteProject, updateProject } from "../api/projects";
import { ApiError } from "../api/client";
import { useForm } from "../hooks/useForm";
import { TextArea } from "../components/ui/TextArea";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import styles from "./ProjectSettingsPage.module.css";

type InfoFormValues = { info: string };

export function ProjectSettingsPage() {
  const { project, membership, refreshProject } = useOutletContext<ProjectOutletContext>();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<InfoFormValues>({
      initialValues: { info: project.info },
      validators: {
        info: (value) =>
          value.trim().length === 0
            ? "Info is required"
            : value.length > 500
              ? "Info must be 500 characters or fewer"
              : undefined,
      },
      async onSubmit(formValues) {
        setSaveSuccess(false);
        await updateProject(project.id, formValues.info.trim());
        await refreshProject();
        setSaveSuccess(true);
      },
    });

  function handleInfoChange(value: string): void {
    setSaveSuccess(false);
    handleChange("info", value);
  }

  async function handleDeleteProject(): Promise<void> {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (membership.role !== "OWNER") {
    return <Navigate to={`/projects/${project.id}/tasks`} replace />;
  }

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        {!formError && saveSuccess && <FormBanner variant="success">Project info saved.</FormBanner>}
        <TextArea
          label="Project info"
          value={values.info}
          error={errors.info}
          onChange={(event) => handleInfoChange(event.target.value)}
          onBlur={() => handleBlur("info")}
        />
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Save changes
        </Button>
      </form>

      <div className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Danger zone</h2>
        <Button variant="secondary" onClick={() => setShowDeleteConfirm(true)}>
          Delete project
        </Button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this project?"
          description={
            deleteError
              ? `This permanently deletes the project and all its tasks. This cannot be undone. ${deleteError}.`
              : "This permanently deletes the project and all its tasks. This cannot be undone."
          }
          confirmLabel="Delete"
          isConfirming={isDeleting}
          onConfirm={() => void handleDeleteProject()}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
