import { useState } from "react";
import { useOutletContext } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import { addMember, removeMember } from "../api/projects";
import { ApiError } from "../api/client";
import { useForm } from "../hooks/useForm";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { MemberRow } from "../components/MemberRow";
import type { MemberWithUser } from "../types/project";
import styles from "./ProjectMembersPage.module.css";

type InviteFormValues = { email: string };

export function ProjectMembersPage() {
  const { project, members, membership, refreshMembers } = useOutletContext<ProjectOutletContext>();
  const [removeTarget, setRemoveTarget] = useState<MemberWithUser | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isOwner = membership.role === "OWNER";

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<InviteFormValues>({
      initialValues: { email: "" },
      validators: {
        email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
      },
      async onSubmit(formValues) {
        await addMember(project.id, formValues.email.trim().toLowerCase());
        await refreshMembers();
      },
    });

  async function confirmRemove(): Promise<void> {
    if (!removeTarget) return;
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await removeMember(project.id, removeTarget.id);
      await refreshMembers();
      setRemoveTarget(null);
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className={styles.page}>
      {isOwner && (
        <form onSubmit={handleSubmit} className={styles.inviteForm}>
          {formError && <FormBanner variant="error">{formError}</FormBanner>}
          <TextField
            label="Invite by email"
            type="email"
            value={values.email}
            error={errors.email}
            onChange={(event) => handleChange("email", event.target.value)}
            onBlur={() => handleBlur("email")}
          />
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Invite
          </Button>
        </form>
      )}

      <div className={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            canRemove={isOwner && member.id !== membership.id}
            isRemoving={isRemoving && removeTarget?.id === member.id}
            onRemove={() => setRemoveTarget(member)}
          />
        ))}
      </div>

      {removeTarget && (
        <ConfirmDialog
          title="Remove member?"
          description={
            removeError
              ? `${removeTarget.name} will lose access to this project. ${removeError}.`
              : `${removeTarget.name} will lose access to this project.`
          }
          confirmLabel="Remove"
          isConfirming={isRemoving}
          onConfirm={() => void confirmRemove()}
          onCancel={() => {
            setRemoveTarget(null);
            setRemoveError(null);
          }}
        />
      )}
    </div>
  );
}
