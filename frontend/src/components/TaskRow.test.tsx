import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TaskRow } from "./TaskRow";
import type { Task } from "../types/task";

const task: Task = {
  id: "t1",
  projectId: "p1",
  creatorMemberId: "m1",
  assigneeMemberId: "m2",
  title: "Write the plan",
  description: null,
  priority: "HIGH",
  status: "IN_PROGRESS",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

describe("TaskRow", () => {
  test("renders title, status, priority, and assignee name, and calls onClick", () => {
    const onClick = mock(() => {});
    render(<TaskRow task={task} assigneeName="Bo" onClick={onClick} />);

    expect(screen.getByText("Write the plan")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Bo")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Write the plan"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("shows 'Unassigned' when assigneeName is null", () => {
    render(<TaskRow task={task} assigneeName={null} onClick={() => {}} />);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });
});
