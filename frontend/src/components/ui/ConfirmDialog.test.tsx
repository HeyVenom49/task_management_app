import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  test("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = mock(() => {});
    render(
      <ConfirmDialog
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("calls onCancel when Cancel is clicked or the overlay is clicked", () => {
    const onCancel = mock(() => {});
    render(
      <ConfirmDialog
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the dialog does not trigger onCancel", () => {
    const onCancel = mock(() => {});
    render(
      <ConfirmDialog
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Delete this?"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
