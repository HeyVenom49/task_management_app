import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  test("renders the label and forwards value/onChange", () => {
    const handleChange = mock(() => {});
    render(<TextArea label="Description" value="hello" onChange={handleChange} />);

    const field = screen.getByLabelText("Description");
    expect(field).toHaveValue("hello");
    fireEvent.change(field, { target: { value: "hello world" } });
    expect(handleChange).toHaveBeenCalled();
  });

  test("shows the error message with role=alert when error is set", () => {
    render(<TextArea label="Description" value="" onChange={() => {}} error="Too long" />);
    expect(screen.getByText("Too long")).toHaveAttribute("role", "alert");
  });
});
