import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import HomePage from "@/modules/feed/HomePage";
import { get, post } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/app/AppShell", () => ({
  UserButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock("@/components/ui", async () => {
  const React = await import("react");
  return {
    Button: ({ children, ...props }: any) => React.createElement("button", props, children),
    ButtonLink: ({ children, ...props }: any) => React.createElement("a", props, children),
    CategoryIcon: ({ category }: { category: string }) => <span>{category}</span>,
    Chip: ({ children, onClick, on }: { children: React.ReactNode; onClick?: () => void; on?: boolean }) => (
      <button type="button" onClick={onClick} data-on={String(on)}>{children}</button>
    ),
    Divider: () => <div />, 
    Empty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Panel: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    PanelTitle: ({ children, right, ...props }: any) => <div {...props}><span>{children}</span>{right}</div>,
    Progress: () => <div />,
    Skeleton: ({ className }: { className?: string }) => <div className={className} />,
    SubPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    TierBadge: ({ tier }: { tier: string }) => <span>{tier}</span>,
  };
});

beforeEach(() => {
  vi.mocked(get).mockImplementation(async (path: string) => {
    if (path === "/api/v1/home") {
      return {
        profileCard: { displayName: "Alex", handle: "alex", headline: "Engineer", targetCareer: "Product" },
        growthSummary: {
          impact: 100,
          validated: 10,
          pending: 0,
          effortCounted: 40,
          roleTier: "Familiar",
          skills: [],
          unlocks: 0,
        },
        eventContext: {
          lastSeenAt: null,
          previousSeenAt: null,
          whileYouWereAway: {
            count: 1,
            byCategory: { Impact: 1 },
            items: [{
              id: "wywa-1",
              category: "Impact",
              kind: "milestone",
              title: "Follow up item",
              body: "New update",
              link: null,
              createdAt: "2026-01-01T00:00:00Z",
              readAt: null,
            }],
          },
        },
        bestNextMove: { kind: "goal", reason: "Keep moving", priority: 1, link: null },
        activeMoves: [],
      };
    }
    if (path.startsWith("/api/v1/feed")) {
      return { items: [], unread: 0 };
    }
    return {};
  });

  vi.mocked(post).mockResolvedValue({});
});

it("removes a while-you-were-away item from the list when its dot is clicked", async () => {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  const toggle = await screen.findByRole("button", { name: /mark unread: follow up item/i });
  fireEvent.click(toggle);

  await waitFor(() => {
    expect(screen.queryByText("Follow up item")).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/v1/feed/wywa-1/read", { read: false });
  });
});
