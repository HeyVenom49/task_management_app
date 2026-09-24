import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { Spinner } from "../components/ui/Spinner";

export function RequireGuest({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <Spinner label="Loading" fullPage />;
  }
  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
