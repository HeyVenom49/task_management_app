import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  test.each([
    ["NOT_STARTED", "Not started"],
    ["IN_PROGRESS", "In progress"],
    ["BLOCKED", "Blocked"],
    ["COMPLETED", "Completed"],
  ] as const)("renders the label for %s", (status, label) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
