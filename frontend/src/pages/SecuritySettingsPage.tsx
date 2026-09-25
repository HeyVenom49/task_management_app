import { useNavigate } from "react-router";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import { useAuth } from "../auth/AuthContext";
import * as authApi from "../api/auth";

type ChangePasswordValues = { currentPassword: string; newPassword: string };

const validators = {
  currentPassword: (value: string) => (value.length < 1 ? "Enter your current password" : undefined),
  newPassword: (value: string) =>
    value.length < 8
      ? "Password must be at least 8 characters"
      : value.length > 72
        ? "Password must be at most 72 characters"
        : undefined,
};

export function SecuritySettingsPage() {
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<ChangePasswordValues>({
      initialValues: { currentPassword: "", newPassword: "" },
      validators,
      onSubmit: async (formValues) => {
        await authApi.changePassword(formValues);
        clearSession();
        navigate("/login", { replace: true });
      },
    });

  return (
    <AppShell>
      <h1>Change password</h1>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Current password"
          type="password"
          value={values.currentPassword}
          onChange={(e) => handleChange("currentPassword", e.target.value)}
          onBlur={() => handleBlur("currentPassword")}
          error={errors.currentPassword}
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          type="password"
          value={values.newPassword}
          onChange={(e) => handleChange("newPassword", e.target.value)}
          onBlur={() => handleBlur("newPassword")}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AppShell>
  );
}
