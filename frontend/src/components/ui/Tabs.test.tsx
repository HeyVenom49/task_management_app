import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  test("renders a link per item and marks the current route active", () => {
    render(
      <MemoryRouter initialEntries={["/projects/p1/members"]}>
        <Tabs
          items={[
            { to: "/projects/p1/tasks", label: "Tasks" },
            { to: "/projects/p1/members", label: "Members" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/projects/p1/tasks");
    const membersLink = screen.getByRole("link", { name: "Members" });
    expect(membersLink).toHaveAttribute("aria-current", "page");
  });
});
