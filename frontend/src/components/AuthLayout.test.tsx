import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  test("renders the title, wordmark, helper content, and children", () => {
    render(
      <AuthLayout title="Sign in" helper={<span>Need an account?</span>}>
        <p>form goes here</p>
      </AuthLayout>,
    );

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("docket")).toBeInTheDocument();
    expect(screen.getByText("Need an account?")).toBeInTheDocument();
    expect(screen.getByText("form goes here")).toBeInTheDocument();
  });
});
