import type { ReactNode } from "react";
import styles from "./FormBanner.module.css";

type FormBannerProps = {
  variant: "error" | "success" | "info";
  children: ReactNode;
};

export function FormBanner({ variant, children }: FormBannerProps) {
  return (
    <div className={[styles.banner, styles[variant]].join(" ")} role={variant === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
