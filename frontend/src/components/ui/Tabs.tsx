import { NavLink } from "react-router";
import styles from "./Tabs.module.css";

type TabsProps = {
  items: { to: string; label: string }[];
};

export function Tabs({ items }: TabsProps) {
  return (
    <nav className={styles.tabs} aria-label="Project sections">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => [styles.tab, isActive ? styles.active : ""].filter(Boolean).join(" ")}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
