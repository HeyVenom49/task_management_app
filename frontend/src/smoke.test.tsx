import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

describe("test infrastructure", () => {
  test("renders into a real DOM", () => {
    render(<div>docket</div>);
    expect(screen.getByText("docket")).toBeInTheDocument();
  });
});
