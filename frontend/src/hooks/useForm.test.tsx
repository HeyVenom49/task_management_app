import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "./useForm";
import { ApiError } from "../api/client";

type Values = { email: string; password: string };

function TestForm({ onSubmit }: { onSubmit: (values: Values) => Promise<void> }) {
  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<Values>({
    initialValues: { email: "", password: "" },
    validators: {
      email: (v) => (v.includes("@") ? undefined : "Enter a valid email address"),
    },
    onSubmit,
  });

  return (
    <form onSubmit={handleSubmit}>
      {formError && <p role="alert">{formError}</p>}
      <input
        aria-label="email"
        value={values.email}
        onChange={(e) => handleChange("email", e.target.value)}
        onBlur={() => handleBlur("email")}
      />
      {errors.email && <span>{errors.email}</span>}
      <button type="submit" disabled={isSubmitting}>
        Submit
      </button>
    </form>
  );
}

describe("useForm", () => {
  test("shows a field validation error on blur without calling onSubmit", () => {
    const onSubmit = mock(async () => {});
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "not-an-email" } });
    fireEvent.blur(screen.getByLabelText("email"));

    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("blocks submit and surfaces the field error when validation fails on submit", () => {
    const onSubmit = mock(async () => {});
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("Submit"));

    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("calls onSubmit with current values when validation passes", async () => {
    const onSubmit = mock(async () => {});
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByText("Submit"));

    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith({ email: "ana@example.com", password: "" });
  });

  test("merges server fieldErrors and shows the top-level message on an ApiError", async () => {
    const onSubmit = mock(async () => {
      throw new ApiError(400, "Validation failed", { email: ["Email already registered"] });
    });
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByText("Submit"));

    await screen.findByText("Email already registered");
    expect(screen.getByRole("alert")).toHaveTextContent("Validation failed");
  });
});
