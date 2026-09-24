import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { SuccessCheck } from "../components/ui/SuccessCheck";
import { useForm } from "../hooks/useForm";
import * as authApi from "../api/auth";

type ResetValues = { newPassword: string; confirmPassword: string };

const validators = {
  newPassword: (value: string) =>
    value.length < 8
      ? "Password must be at least 8 characters"
      : value.length > 72
        ? "Password must be at most 72 characters"
        : undefined,
  confirmPassword: (value: string, allValues: ResetValues) =>
    value !== allValues.newPassword ? "Passwords don't match" : undefined,
};

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [done, setDone] = useState(false);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<ResetValues>({
    initialValues: { newPassword: "", confirmPassword: "" },
    validators,
    onSubmit: async (formValues) => {
      if (!token) return;
      await authApi.resetPassword(token, formValues.newPassword);
      setDone(true);
    },
  });

  if (!token) {
    return (
      <AuthLayout title="Reset password">
        <FormBanner variant="error">This link is invalid or expired.</FormBanner>
        <Link to="/forgot-password">Request a new link</Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password reset">
        <SuccessCheck />
        <FormBanner variant="success">Your password has been reset.</FormBanner>
        <Link to="/login">Sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="New password"
          type="password"
          value={values.newPassword}
          onChange={(e) => handleChange("newPassword", e.target.value)}
          onBlur={() => handleBlur("newPassword")}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          type="password"
          value={values.confirmPassword}
          onChange={(e) => handleChange("confirmPassword", e.target.value)}
          onBlur={() => handleBlur("confirmPassword")}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
