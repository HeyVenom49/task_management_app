import { Link } from "react-router";
import type { Project } from "../types/project";
import styles from "./ProjectRow.module.css";

type ProjectRowProps = {
  project: Project;
  isCreator: boolean;
};

export function ProjectRow({ project, isCreator }: ProjectRowProps) {
  return (
    <Link to={`/projects/${project.id}`} className={styles.row}>
      <div className={styles.info}>
        <p className={styles.excerpt}>{project.info}</p>
        <span className={styles.meta}>
          <span>{isCreator ? "Created by you" : "Shared with you"}</span> ·{" "}
          {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
