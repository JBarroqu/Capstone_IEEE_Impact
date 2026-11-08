import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HomePage from "@/modules/feed/HomePage";
import { get, post } from "@/lib/api";

let serverReadAt: string | null = null;

vi.mock("@/lib/api", () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

afterEach(cleanup);

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
  serverReadAt = null;

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
              readAt: serverReadAt,
            }],
          },
        },
        bestNextMove: { kind: "goal", reason: "Keep moving", priority: 1, link: null },
        activeMoves: [],
      };
    }
    if (path.startsWith("/api/v1/feed")) {
      return {
        items: [{
          id: "wywa-1",
          category: "Impact",
          kind: "milestone",
          title: "Follow up item",
          body: "New update",
          link: null,
          createdAt: "2026-01-01T00:00:00Z",
          readAt: serverReadAt,
        }],
        unread: serverReadAt ? 0 : 1,
      };
    }
    return {};
  });

  vi.mocked(post).mockImplementation(async (path: string, body?: unknown) => {
    if (path.endsWith("/read")) {
      serverReadAt = (body as { read?: boolean } | undefined)?.read ? new Date().toISOString() : null;
    }
    return {};
  });
});

it("removes a while-you-were-away item from the list when its dot is clicked", async () => {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  const aside = document.querySelector("aside");
  if (!aside) throw new Error("Home sidebar was not rendered");
  const wywa = within(aside);
  const notifications = document.getElementById("notifications");
  if (!notifications) throw new Error("Notifications panel was not rendered");
  await wywa.findByRole("button", { name: "Mark read: Follow up item" });
  fireEvent.click(wywa.getByRole("button", { name: "Mark read: Follow up item" }));

  await waitFor(() => {
    expect(within(notifications).getByRole("button", { name: "Mark unread: Follow up item" })).toBeInTheDocument();
    expect(wywa.queryByRole("button", { name: "Mark read: Follow up item" })).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/v1/feed/wywa-1/read", { read: true });
  });
});

it("updates the while-you-were-away dot when the main notification toggle is clicked", async () => {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  const aside = document.querySelector("aside");
  if (!aside) throw new Error("Home sidebar was not rendered");
  const wywa = within(aside);
  const notifications = document.getElementById("notifications");
  if (!notifications) throw new Error("Notifications panel was not rendered");
  const mainToggle = await within(notifications).findByRole("button", { name: "Mark read: Follow up item" });
  fireEvent.click(mainToggle);

  await waitFor(() => {
    expect(wywa.queryByRole("button", { name: /Mark (read|unread): Follow up item/ })).not.toBeInTheDocument();
    expect(within(notifications).getByRole("button", { name: "Mark unread: Follow up item" })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/v1/feed/wywa-1/read", { read: true });
  });

  fireEvent.click(within(notifications).getByRole("button", { name: "Mark unread: Follow up item" }));
  await waitFor(() => {
    expect(wywa.getByRole("button", { name: "Mark read: Follow up item" })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/api/v1/feed/wywa-1/read", { read: false });
  });
});

it("keeps the read state across a fresh page load", async () => {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  const aside = document.querySelector("aside");
  if (!aside) throw new Error("Home sidebar was not rendered");
  fireEvent.click(await within(aside).findByRole("button", { name: "Mark read: Follow up item" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/feed/wywa-1/read", { read: true }));

  cleanup();
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );

  const refreshedAside = document.querySelector("aside");
  const refreshedNotifications = document.getElementById("notifications");
  if (!refreshedAside || !refreshedNotifications) throw new Error("Home page was not rendered after refresh");
  await within(refreshedNotifications).findByRole("button", { name: "Mark unread: Follow up item" });
  expect(within(refreshedAside).queryByRole("button", { name: /Mark (read|unread): Follow up item/ })).not.toBeInTheDocument();
});
