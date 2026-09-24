import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SuccessCheck } from "./SuccessCheck";

describe("SuccessCheck", () => {
  test("renders a decorative, screen-reader-hidden checkmark", () => {
    const { container } = render(<SuccessCheck />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
