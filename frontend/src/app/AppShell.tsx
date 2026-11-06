/* Event_Ecosystem's sticky glass header (docs/DESIGN.md "Layout"), with real routes instead of dead links. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/profile", label: "Profile" },
  { to: "/moves", label: "Moves" },
  { to: "/growth", label: "Growth" },
  { to: "/buddies", label: "Buddies" },
];

export function UserButton({ onClick, label = "Open profile menu" }: { onClick?: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="relative size-11 shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <img className="absolute inset-0 size-11" src="/icons/avatar-circle.svg" alt="" />
      <img className="absolute left-[10px] top-[9px] size-6" src="/icons/user.svg" alt="" />
    </button>
  );
}

export function Logo() {
  return (
    <Link to="/" className="relative h-[63px] w-[61px] shrink-0 overflow-hidden" aria-label="Impact++ home">
      <img src="/icons/ieee-logo.png" alt="IEEE" className="absolute left-[-15px] top-[-25px] h-[97px] w-[252px] max-w-none" />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => get<{ unread: number }>("/api/v1/feed?unread=true").then((r) => alive && setUnread(r.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [loc.pathname]);

  useEffect(() => { setMenu(false); setMobile(false); }, [loc.pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="page-bg min-h-dvh text-navy">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-lg">
        <div className="mx-auto flex min-h-[104px] max-w-[1280px] items-center gap-5 px-5 py-5 lg:gap-6 lg:px-7">
          <Logo />
          <nav className="hidden items-center gap-5 text-sm tracking-[-0.42px] md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `${isActive ? "font-semibold text-navy" : "font-medium text-primary"} transition-opacity hover:opacity-60`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <form role="search" className="ml-auto flex h-[49px] min-w-0 flex-1 items-center rounded-[20px] bg-search pl-5 pr-4 sm:max-w-[540px]"
            onSubmit={(e) => { e.preventDefault(); nav(`/?q=${encodeURIComponent(q.trim())}#notifications`); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications..." aria-label="Search notifications"
              className="min-w-0 flex-1 bg-transparent text-[15px] tracking-[-0.45px] text-text outline-none placeholder:text-border" />
            <button type="submit" aria-label="Search" className="relative ml-2 size-[30px] shrink-0 rounded-full transition-transform hover:scale-105">
              <img className="absolute inset-0 size-[30px]" src="/icons/search-circle.svg" alt="" />
              <img className="absolute left-[7px] top-[7px] size-4" src="/icons/search.svg" alt="" />
            </button>
          </form>
          <div className="relative flex shrink-0 items-center gap-4 sm:gap-6" ref={menuRef}>
            <button type="button" aria-label={unread ? `${unread} unread notifications` : "Notifications"} className="relative size-[25px]"
              onClick={() => nav("/#notifications")}>
              <img className="size-[25px]" src="/icons/bell.svg" alt="" />
              {unread > 0 && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-unread" />}
            </button>
            <button type="button" aria-label="Toggle menu" aria-expanded={mobile} className="size-[25px] md:hidden" onClick={() => setMobile((m) => !m)}>
              <img className="size-[25px]" src="/icons/menu.svg" alt="" />
            </button>
            <UserButton onClick={() => setMenu((m) => !m)} />
            {menu && (
              <div className="absolute right-0 top-14 w-56 rounded-xl border border-border bg-white p-2 text-sm shadow-lg">
                <p className="truncate px-3 py-2 text-xs text-secondary">{me?.displayName || me?.email}{me?.handle ? ` · @${me.handle}` : ""}</p>
                <Link to="/profile" className="block rounded-lg px-3 py-2 hover:bg-search">View profile</Link>
                <Link to="/buddies" className="block rounded-lg px-3 py-2 hover:bg-search">Buddies and reviews</Link>
                <button type="button" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-search" onClick={async () => { await signOut(); nav("/auth/sign-in"); }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
        {mobile && (
          <nav className="flex flex-col gap-1 border-t border-white/60 px-5 pb-4 md:hidden" aria-label="Primary mobile">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-chip-active font-semibold text-navy" : "text-primary"}`}>{n.label}</NavLink>)}
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto max-w-[1210px] px-5 pb-16 pt-2 lg:px-0">{children}</main>
    </div>
  );
}

/** Pages before sign-in: the same glass header with only the logo. */
export function BareShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-bg min-h-dvh text-navy">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-lg">
        <div className="mx-auto flex min-h-[104px] max-w-[1280px] items-center gap-5 px-5 py-5 lg:px-7">
          <Logo />
          <span className="text-sm font-semibold tracking-[-0.42px] text-navy">Impact++</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1210px] px-5 pb-16 pt-8 lg:px-0">{children}</main>
    </div>
  );
}
