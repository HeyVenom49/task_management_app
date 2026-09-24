import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  test("renders its label and responds to click", () => {
    const onClick = mock(() => {});
    render(<Button onClick={onClick}>Sign in</Button>);

    fireEvent.click(screen.getByText("Sign in"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("is disabled and marked busy while loading, and does not fire onClick", () => {
    const onClick = mock(() => {});
    render(
      <Button onClick={onClick} isLoading>
        Sign in
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
