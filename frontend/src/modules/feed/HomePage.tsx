/* Home (Module 5, owner JBarroqu): Event_Ecosystem's layout with real data. Left: profile, Impact Score, best next
   move (D-40), While You Were Away (D-39), skills. Right: notifications with the chips (D-50) and read toggle. */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { UserButton } from "@/app/AppShell";
import { Button, ButtonLink, CategoryIcon, Chip, Divider, Empty, Panel, PanelTitle, Progress, Skeleton, SubPanel, Tag, TierBadge } from "@/components/ui";
import { get, post } from "@/lib/api";
import { ago, pts, STATUS_LABEL } from "@/lib/format";
import type { FeedItem, Home } from "@/lib/types";

const CHIPS = ["People", "Opportunity", "Impact", "Growth", "Enablement", "Social"];

function FeedRow({ n, onToggle, onOpen }: { n: FeedItem; onToggle: () => void; onOpen: () => void }) {
  const read = !!n.readAt;
  return (
    <div className={`flex min-h-[79px] w-full items-center gap-4 border-b border-black px-2.5 py-3 transition-colors hover:bg-white md:gap-[27px] ${read ? "opacity-55" : ""}`}>
      <CategoryIcon category={n.category} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left text-base leading-6 tracking-[-0.48px]">
        <strong className="block truncate font-semibold text-black">{n.title}</strong>
        <span className="block truncate text-secondary">{n.body}</span>
      </button>
      <time className="hidden shrink-0 text-right font-semibold text-time sm:block" dateTime={n.createdAt}>{ago(n.createdAt)}</time>
      <button type="button" onClick={onToggle} aria-label={`${read ? "Mark unread" : "Mark read"}: ${n.title}`}
        className={`size-3 shrink-0 rounded-full border ${read ? "border-border bg-transparent" : "border-unread bg-unread"}`} />
    </div>
  );
}

export default function HomePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [home, setHome] = useState<Home | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [chip, setChip] = useState("");
  const [wywaChecked, setWywaChecked] = useState<Record<string, boolean>>({});

  const loadFeed = useCallback(() => {
    const qs = new URLSearchParams();
    if (chip) qs.set("chip", chip);
    if (q) qs.set("q", q);
    get<{ items: FeedItem[]; unread: number }>(`/api/v1/feed?${qs}`).then((r) => { setItems(r.items); setUnread(r.unread); });
  }, [chip, q]);
  useEffect(() => { get<Home>("/api/v1/home").then(setHome); }, []);
  useEffect(() => {
    if (!home?.eventContext.whileYouWereAway.items) return;
    setWywaChecked((prev) => {
      const next = { ...prev };
      for (const item of home.eventContext.whileYouWereAway.items) {
        if (!(item.id in next)) next[item.id] = true;
      }
      return next;
    });
  }, [home?.eventContext.whileYouWereAway.items]);
  useEffect(loadFeed, [loadFeed]);
  useEffect(() => { if (location.hash === "#notifications") document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth" }); }, [items]);

  const toggle = async (n: FeedItem, opts: { updateUnread?: boolean } = {}) => {
    const read = !n.readAt;
    const updateUnread = opts.updateUnread ?? items?.some((x) => x.id === n.id) ?? false;
    setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, readAt: read ? new Date().toISOString() : null } : x)) ?? null);
    if (updateUnread) setUnread((u) => u + (read ? -1 : 1));
    await post(`/api/v1/feed/${n.id}/read`, { read });
  };
  const clearWywa = async (n: FeedItem) => {
    setWywaChecked((prev) => ({ ...prev, [n.id]: false }));
    setHome((curr) => {
      if (!curr) return curr;
      const remaining = curr.eventContext.whileYouWereAway.items.filter((x) => x.id !== n.id);
      return {
        ...curr,
        eventContext: {
          ...curr.eventContext,
          whileYouWereAway: {
            ...curr.eventContext.whileYouWereAway,
            count: Math.max(0, curr.eventContext.whileYouWereAway.count - 1),
            items: remaining,
          },
        },
      };
    });
    await post(`/api/v1/feed/${n.id}/read`, { read: false });
  };
  const open = async (n: FeedItem) => { if (!n.readAt) await toggle(n, { updateUnread: items?.some((x) => x.id === n.id) ?? false }); if (n.link) nav(n.link); };

  const best = home?.bestNextMove;
  const wywa = home?.eventContext.whileYouWereAway;
  return (
    <div className="grid gap-8 lg:grid-cols-[424px_minmax(0,738px)]">
      <aside className="rounded-xl border border-border bg-panel px-4 pb-12 pt-[31px] lg:min-h-[825px]">
        <div className="flex items-start gap-2">
          <UserButton onClick={() => nav("/profile")} label="Open your profile" />
          <div className="min-w-0 flex-1 pt-0.5">
            {home ? <>
              <strong className="block truncate text-base font-semibold text-navy">{home.profileCard.displayName || "Your profile"}</strong>
              <span className="block truncate text-sm text-secondary">{home.profileCard.headline || (home.profileCard.handle ? `@${home.profileCard.handle}` : "")}</span>
            </> : <><Skeleton className="h-[22px] w-[153px]" /><Skeleton className="mt-[11px] h-[14px] w-[260px]" /></>}
          </div>
        </div>
        <Divider />
        <div className="text-center">
          <strong className="block text-[32px] font-bold leading-[1.5] tracking-[-0.96px] text-primary">{home ? pts(home.growthSummary.impact) : "..."}</strong>
          <span className="block text-xs leading-[1.5] tracking-[-0.36px] text-text">Impact Score</span>
          {home && <span className="block text-xs leading-[1.5] tracking-[-0.36px] text-text">
            {home.profileCard.targetCareer ? `${home.profileCard.targetCareer} · ` : ""}<TierBadge tier={home.growthSummary.roleTier} />
            {home.growthSummary.pending > 0 && ` · ${pts(home.growthSummary.pending)} pending`}
          </span>}
        </div>
        <Divider />
        <SubPanel>
          <h2 className="mb-3 text-base font-bold text-primary">Best next move</h2>
          <div className="rounded-lg bg-white p-5">
            {best ? <>
              <p className="mb-4 text-[15px] leading-6 text-text">{best.reason}</p>
              {best.link && <ButtonLink to={best.link}>Go</ButtonLink>}
            </> : <Skeleton className="h-16 w-full" />}
          </div>
          {wywa && wywa.count > 0 && (
            <div className="mt-5">
              <h2 className="mb-2 text-base font-bold text-primary">While you were away</h2>
              <p className="mb-2 text-xs text-secondary">{wywa.count} update{wywa.count === 1 ? "" : "s"} since your last visit.</p>
              <ul className="flex flex-col gap-2">
                {wywa.items.slice(0, 4).map((n) => {
                  const checked = wywaChecked[n.id] ?? true;
                  return (
                    <li key={n.id} className="flex items-center gap-2">
                      <button type="button" onClick={() => open(n)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-white p-3 text-left text-sm hover:shadow-md">
                        <CategoryIcon category={n.category} size={32} /><span className="min-w-0 flex-1 truncate font-semibold">{n.title}</span>
                      </button>
                      <button type="button" onClick={() => void clearWywa(n)} aria-label={`${checked ? "Mark unread" : "Mark read"}: ${n.title}`}
                        className={`size-3 shrink-0 rounded-full border ${checked ? "border-unread bg-unread" : "border-border bg-transparent"}`} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {home && home.growthSummary.skills.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-3 text-base font-bold text-primary">Metrics</h2>
              <div className="flex flex-col gap-3 rounded-lg bg-white p-5">
                {home.growthSummary.skills.map((s) => (
                  <div key={s.skillId} className="flex flex-col gap-1">
                    <span className="flex justify-between text-xs"><span className="font-semibold text-navy">{s.name}</span><span className="text-secondary">{s.tier}</span></span>
                    <Progress value={s.progress} label={`${s.name} progress`} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </SubPanel>
      </aside>

      <section className="flex min-w-0 flex-col gap-8">
        <Panel id="notifications" className="lg:min-h-[646px]">
          <PanelTitle as="h1" count={unread} right={unread > 0 ? <Button kind="text" className="text-xs" onClick={async () => { await post("/api/v1/feed/read-all"); loadFeed(); }}>Mark all read</Button> : undefined}>
            Notifications
          </PanelTitle>
          <div className="chip-scroll flex items-center gap-2 overflow-x-auto py-2" aria-label="Notification topics">
            {CHIPS.map((c) => <Chip key={c} on={chip === c} onClick={() => setChip(chip === c ? "" : c)}>{c}</Chip>)}
          </div>
          {q && <p className="mt-1 text-xs text-secondary">Matching "{q}". <Link className="text-primary" to="/">Clear</Link></p>}
          <div className="notification-list mt-2 max-h-[474px] overflow-y-auto pr-1">
            {items === null ? [0, 1, 2].map((i) => <Skeleton key={i} className="my-3 h-[60px] w-full" />)
              : items.length ? items.map((n) => <FeedRow key={n.id} n={n} onToggle={() => toggle(n)} onOpen={() => open(n)} />)
                : <Empty>{chip || q ? "No notifications match your filters." : "Nothing yet. Start a wish and your updates show up here."}</Empty>}
          </div>
        </Panel>
        <Panel>
          <PanelTitle count={home?.activeMoves.length ?? 0} right={<ButtonLink to="/moves/new" kind="secondary">Start a wish</ButtonLink>}>Active moves</PanelTitle>
          {!home ? <Skeleton className="h-20 w-full" /> : home.activeMoves.length === 0 ? <Empty>No moves in progress.</Empty> : (
            <ul className="grid gap-[20px] sm:grid-cols-2">
              {home.activeMoves.map((m) => (
                <li key={m.selectedMoveId}>
                  <Link to={`/moves/${m.wishId}?move=${m.selectedMoveId}`} className="block min-h-[150px] rounded-lg bg-white p-5 text-left transition-shadow hover:shadow-md">
                    <span className="mb-2 block text-xs font-semibold text-secondary">{m.wishText}</span>
                    <strong className="mb-3 block font-semibold leading-6 text-black">{m.title}</strong>
                    <Tag tone={m.status === "needs_work" ? "impact" : "neutral"}>{STATUS_LABEL[m.status] ?? m.status}</Tag>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
