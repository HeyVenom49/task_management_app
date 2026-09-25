import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PriorityPill } from "./PriorityPill";

describe("PriorityPill", () => {
  test.each([
    ["VERY_LOW", "Very low"],
    ["LOW", "Low"],
    ["MODERATE", "Moderate"],
    ["HIGH", "High"],
    ["URGENT", "Urgent"],
  ] as const)("renders the label for %s", (priority, label) => {
    render(<PriorityPill priority={priority} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
