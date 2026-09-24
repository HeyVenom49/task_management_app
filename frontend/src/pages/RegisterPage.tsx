import { useState } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import { ApiError } from "../api/client";
import * as authApi from "../api/auth";

type RegisterValues = { name: string; email: string; password: string };

const validators = {
  name: (value: string) => (value.trim().length < 3 ? "Name must be at least 3 characters" : undefined),
  email: (value: string) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
  password: (value: string) =>
    value.length < 8
      ? "Password must be at least 8 characters"
      : value.length > 72
        ? "Password must be at most 72 characters"
        : undefined,
};

export function RegisterPage() {
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<RegisterValues>({
      initialValues: { name: "", email: "", password: "" },
      validators,
      onSubmit: async (formValues) => {
        await authApi.register(formValues);
        setRegisteredEmail(formValues.email);
      },
    });

  async function handleResend() {
    if (!registeredEmail) return;
    setResendState("sending");
    setResendError(null);
    try {
      await authApi.resendVerification(registeredEmail);
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

  if (registeredEmail) {
    return (
      <AuthLayout title="Check your email">
        <FormBanner variant="success">
          We sent a verification link to {registeredEmail}. Click it to activate your account.
        </FormBanner>
        {resendError && <FormBanner variant="error">{resendError}</FormBanner>}
        <Button
          variant="text"
          type="button"
          onClick={handleResend}
          isLoading={resendState === "sending"}
          disabled={resendState === "sent"}
        >
          {resendState === "sent" ? "Email sent" : "Resend email"}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" helper={<Link to="/login">Already have an account? Sign in</Link>}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Name"
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          onBlur={() => handleBlur("name")}
          error={errors.name}
          autoComplete="name"
        />
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
          autoComplete="new-password"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
