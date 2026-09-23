import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { BoardActor, BoardIssue } from "./contract";
import { BOARD_STRINGS as S } from "./strings";
import { BoardDrawer } from "./board-drawer";

// The drawer's "open in board" affordance is an AppLink; the navigation
// provider is app wiring, so the test renders it as a plain anchor. (Repo rule:
// no next/* or react-router-dom mocks — this stubs the views adapter instead.)
vi.mock("../../navigation", () => ({
  AppLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const issue: BoardIssue = {
  id: "01-issue",
  number: 158,
  identifier: "WOLFLEE-158",
  title: "Drawer shows the full untruncated title — even a very long one that the card would clamp",
  statusKey: "in_review",
  statusCategory: "in_review",
  statusName: "In Review",
  parentId: "01-parent",
  stage: 2,
  depth: 1,
  assignee: { id: "agent:a1", type: "agent" },
  childProgress: { total: 4, done: 1 },
};

const agent: BoardActor = { id: "agent:a1", actorType: "agent", name: "claude", runtimeStatus: "working", model: "glm-5.3", activeCount: 2 };

const issueHref = (selected: BoardIssue) => `/w/acme/issue/${selected.id}`;

describe("BoardDrawer — issue selection", () => {
  it("shows identity, full title, stage, and child progress", () => {
    render(<BoardDrawer selection={{ kind: "issue", issue }} onClose={vi.fn()} onLocate={vi.fn()} issueHref={issueHref} />);
    expect(screen.getByText("WOLFLEE-158")).toBeInTheDocument();
    expect(screen.getByText(issue.title)).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
    expect(screen.getByText("agent:a1")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<BoardDrawer selection={{ kind: "issue", issue }} onClose={onClose} onLocate={vi.fn()} issueHref={issueHref} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without a selection", () => {
    const { container } = render(<BoardDrawer selection={null} onClose={vi.fn()} onLocate={vi.fn()} issueHref={issueHref} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links into the issue detail page", () => {
    render(<BoardDrawer selection={{ kind: "issue", issue }} onClose={vi.fn()} onLocate={vi.fn()} issueHref={issueHref} />);
    expect(screen.getByRole("link", { name: new RegExp(S.openInBoard) })).toHaveAttribute("href", "/w/acme/issue/01-issue");
  });
});

describe("BoardDrawer — actor and squad selection", () => {
  it("shows the agent runtime, model, and active work", () => {
    render(
      <BoardDrawer selection={{ kind: "actor", actor: agent, role: "agent" }} onClose={vi.fn()} onLocate={vi.fn()} issueHref={issueHref} />,
    );
    expect(screen.getByText("claude")).toBeInTheDocument();
    expect(screen.getByText("glm-5.3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("lists squad members with the leader badge and locates on click", () => {
    const leader: BoardActor = { id: "agent:l1", actorType: "agent", name: "leader" };
    const member: BoardActor = { id: "agent:m1", actorType: "agent", name: "member" };
    const onLocate = vi.fn();
    render(
      <BoardDrawer
        selection={{ kind: "squad", actor: { id: "squad:s1", actorType: "squad", name: "dev-strike" }, leader, members: [member] }}
        onClose={vi.fn()}
        onLocate={onLocate}
        issueHref={issueHref}
      />,
    );
    expect(screen.getByText("dev-strike")).toBeInTheDocument();
    expect(screen.getByText("leader")).toBeInTheDocument();
    expect(screen.getByText(S.leaderBadge)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /member/ }));
    expect(onLocate).toHaveBeenCalledWith("agent:m1");
  });
});
