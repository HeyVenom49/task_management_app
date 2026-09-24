import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextField } from "./TextField";

describe("TextField", () => {
  test("associates the label and shows a validation error", () => {
    render(<TextField label="Email" value="" onChange={() => {}} error="Enter a valid email address" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  });

  test("calls onChange with the new value", () => {
    const onChange = mock(() => {});
    render(<TextField label="Email" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("renders a show/hide toggle for password fields that switches the input type", () => {
    render(<TextField label="Password" type="password" value="secret" onChange={() => {}} />);

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByLabelText("Show password"));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Hide password")).toBeInTheDocument();
  });

  test("does not render a toggle for non-password fields", () => {
    render(<TextField label="Email" type="email" value="" onChange={() => {}} />);
    expect(screen.queryByLabelText("Show password")).not.toBeInTheDocument();
  });
});
