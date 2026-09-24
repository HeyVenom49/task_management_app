import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { FormBanner } from "./FormBanner";

describe("FormBanner", () => {
  test("renders an error banner with role=alert", () => {
    render(<FormBanner variant="error">Invalid email or password</FormBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  test("renders a success banner with role=status", () => {
    render(<FormBanner variant="success">Password reset successful</FormBanner>);
    expect(screen.getByRole("status")).toHaveTextContent("Password reset successful");
  });
});
