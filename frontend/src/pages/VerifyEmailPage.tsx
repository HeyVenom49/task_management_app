import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Spinner } from "../components/ui/Spinner";
import { SuccessCheck } from "../components/ui/SuccessCheck";
import { FormBanner } from "../components/ui/FormBanner";
import * as authApi from "../api/auth";

type VerifyState = "verifying" | "success" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>(token ? "verifying" : "error");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authApi
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setState("success");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout title="Verify your email">
      {state === "verifying" && <Spinner label="Verifying your email" />}
      {state === "success" && (
        <>
          <SuccessCheck />
          <FormBanner variant="success">Email verified — you can sign in now.</FormBanner>
          <Link to="/login">Go to sign in</Link>
        </>
      )}
      {state === "error" && (
        <>
          <FormBanner variant="error">This link is invalid or expired.</FormBanner>
          <Link to="/register">Back to registration</Link>
        </>
      )}
    </AuthLayout>
  );
}
