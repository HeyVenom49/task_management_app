import { Button } from "./ui/Button";
import type { MemberWithUser } from "../types/project";
import styles from "./MemberRow.module.css";

type MemberRowProps = {
  member: MemberWithUser;
  canRemove: boolean;
  isRemoving: boolean;
  onRemove: () => void;
};

export function MemberRow({ member, canRemove, isRemoving, onRemove }: MemberRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.identity}>
        <span className={styles.name}>{member.name}</span>
        <span className={styles.email}>{member.email}</span>
      </div>
      <span className={`${styles.role} ${member.role === "OWNER" ? styles.roleOwner : ""}`}>
        {member.role === "OWNER" ? "Owner" : "Member"}
      </span>
      {canRemove && (
        <Button variant="secondary" isLoading={isRemoving} onClick={onRemove}>
          Remove
        </Button>
      )}
    </div>
  );
}
