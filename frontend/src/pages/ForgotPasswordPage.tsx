import { useState } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import * as authApi from "../api/auth";

type ForgotValues = { email: string };

const validators = {
  email: (value: string) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
};

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<ForgotValues>({
    initialValues: { email: "" },
    validators,
    onSubmit: async (formValues) => {
      await authApi.forgotPassword(formValues.email);
      setSent(true);
    },
  });

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <FormBanner variant="success">If that email exists, we sent a password reset link.</FormBanner>
        <Link to="/login">Back to sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password" helper={<Link to="/login">Back to sign in</Link>}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          error={errors.email}
          autoComplete="email"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
