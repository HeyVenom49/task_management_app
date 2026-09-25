import { useState } from "react";
import { Link, useLocation } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import { useAuth } from "../auth/AuthContext";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { ApiError } from "../api/client";
import * as authApi from "../api/auth";

type LoginValues = { email: string; password: string };

const validators = {
  email: (value: string) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
  password: (value: string) => (value.length < 1 ? "Enter your password" : undefined),
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useTransitionNavigate();
  const location = useLocation();
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  const from = (location.state as { from?: string; message?: string } | null)?.from ?? "/";
  const successMessage = (location.state as { from?: string; message?: string } | null)?.message;

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<LoginValues>({
    initialValues: { email: "", password: "" },
    validators,
    onSubmit: async (formValues) => {
      setNeedsVerification(null);
      try {
        await login(formValues.email, formValues.password);
        navigate(from, { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setNeedsVerification(formValues.email);
          return;
        }
        throw err;
      }
    },
  });

  async function handleResend() {
    if (!needsVerification) return;
    setResendState("sending");
    setResendError(null);
    try {
      await authApi.resendVerification(needsVerification);
      setResendState("sent");
    } catch (err) {
      setResendState("idle");
      if (err instanceof ApiError) {
        setResendError(err.message);
      } else {
        setResendError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <AuthLayout title="Welcome back" helper={<Link to="/register">Need an account? Create one</Link>}>
      <form onSubmit={handleSubmit} noValidate>
        {successMessage && <FormBanner variant="success">{successMessage}</FormBanner>}
        {needsVerification && (
          <FormBanner variant="error">
            Please verify your email before signing in.{" "}
            <Button
              variant="text"
              type="button"
              onClick={handleResend}
              isLoading={resendState === "sending"}
              disabled={resendState === "sent"}
            >
              {resendState === "sent" ? "Email sent" : "Resend verification email"}
            </Button>
          </FormBanner>
        )}
        {resendError && <FormBanner variant="error">{resendError}</FormBanner>}
        {formError && !needsVerification && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Password"
          type="password"
          value={values.password}
          onChange={(e) => handleChange("password", e.target.value)}
          onBlur={() => handleBlur("password")}
          error={errors.password}
          autoComplete="current-password"
        />
        <p>
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <Button type="submit" isLoading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
