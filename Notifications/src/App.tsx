declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}

import { useMemo, useState } from "react"

const assets = "/assets"

type Category = "Social" | "Pro" | "Enablement" | "Impact" | "Events" | "Growth"

type Notification = {
  id: number
  category: Category
  title: string
  description: string
  time: string
}

const categoryAssets: Record<Category, { circle: string icon?: string }> = {
  Social: { circle: "53051.svg", icon: "ee531.svg" },
  Pro: { circle: "dd7f3.svg", icon: "3b812.svg" },
  Enablement: { circle: "0747b.svg", icon: "38507.svg" },
  Impact: { circle: "f801a.svg", icon: "d6b4e.svg" },
  Events: { circle: "6f490.svg" },
  Growth: { circle: "894f0.svg", icon: "ccd60.svg" },
}

const initialNotifications: Notification[] = [
  {
    id: 1,
    category: "Social",
    title: "You got 10 Replies to your Post",
    description: "Your post on 9/21/2026 has received information",
    time: "2 Day  Ago",
  },
  {
    id: 2,
    category: "Pro",
    title: "John wants to Connect",
    description: "Accept his invite and start discussion",
    time: "2 Day  Ago",
  },
  {
    id: 3,
    category: "Enablement",
    title: "Find a Mentor",
    description: "Join the community to find a mentor for your next project.",
    time: "2 Day  Ago",
  },
  {
    id: 4,
    category: "Impact",
    title: "Your Paper got Cited 20 More Times",
    description: "Your Impact++ Score increased by 20 points",
    time: "2 Day  Ago",
  },
  {
    id: 5,
    category: "Events",
    title: "An Event is Happening Nearby",
    description: "A Career Fair is in your city in 2 days",
    time: "2 Day  Ago",
  },
  {
    id: 6,
    category: "Growth",
    title: "You Are Close to The Next Medal",
    description: "Learn on you pathway for 30 minutes to get Learner badge.",
    time: "2 Day  Ago",
  },
  {
    id: 7,
    category: "Events",
    title: "Community Workshop Starts Soon",
    description: "Your saved community workshop starts tomorrow.",
    time: "3 Day  Ago",
  },
]

const chips = [
  "People",
  "Opportunity",
  "Impact",
  "Growth",
  "Enablement",
  "Social",
]

function CategoryBadge({ category }: { category: Category }) {
  const badge = categoryAssets[category]

  return (
    <span className="relative block size-[50px] shrink-0" aria-hidden="true">
      <img
        className="absolute inset-0 size-[50px]"
        src={`${assets}/${badge.circle}`}
        alt=""
      />
      {badge.icon && (
        <img
          className="absolute left-1/2 top-1/2 size-[25px] -translate-x-1/2 -translate-y-1/2"
          src={`${assets}/${badge.icon}`}
          alt=""
        />
      )}
    </span>
  )
}

function UserButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative size-11 shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629b]"
      aria-label="Open profile"
    >
      <img
        className="absolute inset-0 size-11"
        src={`${assets}/cd754.svg`}
        alt=""
      />
      <img
        className="absolute left-[10px] top-[9px] size-6"
        src={`${assets}/2c134.svg`}
        alt=""
      />
    </button>
  )
}

function TopicChips({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <div
      className="chip-scroll flex items-center gap-2 overflow-x-auto py-2"
      aria-label="Notification topics"
      data-node-id="7:2176"
    >
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          aria-pressed={selected === chip}
          onClick={() => onSelect(selected === chip ? "" : chip)}
          className={`h-8 shrink-0 rounded-lg border px-3 text-center text-sm leading-5 tracking-[0.1px] transition-colors ${
            selected === chip
              ? "border-[#00629b] bg-[#e7f3fe] text-[#00629b]"
              : "border-[#cac4d0] bg-transparent text-[#49454f] hover:bg-white"
          }`}
          style={{
            fontFamily: '"Roboto:Medium"',
            fontVariationSettings: '"wdth" 100',
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <section
      className="rounded-lg bg-[#f5f7f9] px-[17px] pb-6 pt-4"
      aria-label="Metrics"
    >
      <h2
        className="mb-3 text-base text-[#00629b]"
        style={{ fontFamily: '"Poppins:Bold"' }}
      >
        Metrics
      </h2>
      <div className="rounded-lg bg-white px-7 py-8">
        <div className="flex h-[165px] items-end gap-5">
          {[79, 108, 134, 79, 79].map((height, index) => (
            <span
              key={index}
              className="w-[22px] shrink-0 bg-[#d9d9d9]"
              style={{ height }}
            />
          ))}
          <span className="ml-auto self-start pt-5">
            <i className="mb-2 block h-[5px] w-[62px] bg-[#d9d9d9]" />
            <i className="mb-2 block h-[5px] w-[62px] bg-[#d9d9d9]" />
            <i className="block h-[5px] w-[62px] bg-[#d9d9d9]" />
          </span>
        </div>
      </div>
      <SkeletonCard className="mt-12" />
    </section>
  )
}

function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.alert("Recommendation opened")}
      className={`block min-h-[279px] w-full rounded-lg bg-white p-[29px] text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#00629b] ${className}`}
      aria-label="Open recommendation"
    >
      <span className="mb-4 block h-[72px] w-full bg-[#d9d9d9]" />
      <span className="mb-7 flex gap-5">
        <i className="block h-[25px] w-[116px] bg-[#d9d9d9]" />
        <i className="block h-[25px] w-[102px] bg-[#d9d9d9]" />
      </span>
      <i className="mb-3 block h-[13px] w-full bg-[#d9d9d9]" />
      <i className="mb-3 block h-[13px] w-full bg-[#d9d9d9]" />
      <i className="block h-[13px] w-full bg-[#d9d9d9]" />
    </button>
  )
}

export default function App() {
  const [query, setQuery] = useState("")
  const [selectedChip, setSelectedChip] = useState("")
  const [readIds, setReadIds] = useState<number[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const filteredNotifications = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return initialNotifications.filter((notification) => {
      const matchesSearch =
        !normalized ||
        `${notification.title} ${notification.description} ${notification.category}`
          .toLowerCase()
          .includes(normalized)
      const mappedChip =
        selectedChip === "People"
          ? ["Social", "Pro"].includes(notification.category)
          : selectedChip === "Opportunity"
            ? ["Events", "Pro"].includes(notification.category)
            : selectedChip === ""
              ? true
              : notification.category === selectedChip
      return matchesSearch && mappedChip
    })
  }, [query, selectedChip])

  const toggleRead = (id: number) => {
    setReadIds((current) =>
      current.includes(id)
        ? current.filter((readId) => readId !== id)
        : [...current, id],
    )
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#fff_0%,#e7f3fe_86%,#dfeffe_100%)] text-[#0b3142]">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-lg">
        <div className="mx-auto flex min-h-[104px] max-w-[1280px] items-center gap-5 px-5 py-5 lg:gap-6 lg:px-7">
          <a
            href="#main"
            className="relative h-[63px] w-[61px] shrink-0 overflow-hidden"
            aria-label="Home"
          >
            <img
              src={`${assets}/0f14d.png`}
              alt="Platform logo"
              className="absolute left-[-15px] top-[-25px] h-[97px] w-[252px] max-w-none"
            />
          </a>
          <nav
            className="hidden items-center gap-5 text-sm tracking-[-0.42px] md:flex"
            aria-label="Primary"
          >
            {["Home", "Learn", "Community", "Events"].map((item, index) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={`${
                  index === 0 ? "text-[#0b3142]" : "text-[#00629b]"
                } transition-opacity hover:opacity-60`}
                style={{
                  fontFamily:
                    index === 0 ? '"Poppins:SemiBold"' : '"Poppins:Medium"',
                }}
              >
                {item}
              </a>
            ))}
          </nav>
          <form
            className="ml-auto flex h-[49px] min-w-0 flex-1 items-center rounded-[20px] bg-[#edf5ff] pl-5 pr-4 sm:max-w-[540px]"
            onSubmit={(event) => event.preventDefault()}
            role="search"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[15px] tracking-[-0.45px] text-[#3c3c3c] outline-none placeholder:text-[#9db0c9]"
              style={{ fontFamily: '"Poppins:Regular"' }}
              placeholder="Search..."
              aria-label="Search notifications"
            />
            <button
              type="submit"
              className="relative ml-2 size-[30px] shrink-0 rounded-full transition-transform hover:scale-105"
              aria-label="Search"
            >
              <img
                className="absolute inset-0 size-[30px]"
                src={`${assets}/548e9.svg`}
                alt=""
              />
              <img
                className="absolute left-[7px] top-[7px] size-4"
                src={`${assets}/34f9e.svg`}
                alt=""
              />
            </button>
          </form>
          <div className="relative flex shrink-0 items-center gap-4 sm:gap-6">
            <button
              type="button"
              className="relative size-[25px]"
              onClick={() =>
                document
                  .querySelector("#notifications")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              aria-label="View notifications"
            >
              <img className="size-[25px]" src={`${assets}/50064.svg`} alt="" />
              {readIds.length < initialNotifications.length && (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#f04444]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="hidden size-[25px] sm:block"
              aria-expanded={menuOpen}
              aria-label="Toggle menu"
            >
              <img className="size-[25px]" src={`${assets}/17ebc.svg`} alt="" />
            </button>
            <UserButton onClick={() => setProfileOpen((open) => !open)} />
            {(menuOpen || profileOpen) && (
              <div className="absolute right-0 top-14 w-48 rounded-xl border border-[#9db0c9] bg-white p-2 text-sm shadow-lg">
                <button
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#edf5ff]"
                  onClick={() => setProfileOpen(false)}
                >
                  View profile
                </button>
                <button
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#edf5ff]"
                  onClick={() => setMenuOpen(false)}
                >
                  Account settings
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto grid max-w-[1210px] gap-8 px-5 pb-16 pt-0 lg:grid-cols-[424px_minmax(0,738px)] lg:px-0"
      >
        <aside className="mt-0 rounded-xl border border-[#9db0c9] bg-[#f8fbfe] px-4 pb-12 pt-[31px] lg:min-h-[825px]">
          <div className="flex h-12 items-start gap-2">
            <UserButton onClick={() => setProfileOpen(true)} />
            <div className="flex-1 pt-0.5">
              <div className="h-[22px] w-[153px] max-w-full bg-[#d9d9d9]" />
              <div className="mt-[11px] h-[14px] w-[292px] max-w-full bg-[#d9d9d9]" />
            </div>
          </div>
          <img
            className="my-5 h-px w-full"
            src={`${assets}/f8163.svg`}
            alt=""
            aria-hidden="true"
          />
          <div className="text-center" style={{ fontFamily: '"Poppins:Bold"' }}>
            <strong className="block text-[32px] leading-[1.5] tracking-[-0.96px] text-[#00629b]">
              50
            </strong>
            <span className="block text-xs leading-[1.5] tracking-[-0.36px] text-[#3c3c3c]">
              Impact Score
            </span>
            <span className="block text-xs leading-[1.5] tracking-[-0.36px] text-[#3c3c3c]">
              Description
            </span>
          </div>
          <img
            className="my-5 h-px w-full"
            src={`${assets}/f8163.svg`}
            alt=""
            aria-hidden="true"
          />
          <MetricsSkeleton />
        </aside>

        <section className="min-w-0">
          <div
            id="notifications"
            className="rounded-xl border border-[#9db0c9] bg-[#f8fbfe] px-[26px] pb-8 pt-[23px] lg:min-h-[646px]"
          >
            <div className="flex h-[47px] items-center gap-2">
              <h1
                className="text-base tracking-[-0.48px] text-[#287aaa]"
                style={{ fontFamily: '"Poppins:Bold"' }}
              >
                Notifications
              </h1>
              <span
                className="rounded-full bg-white px-3 py-0.5 text-xs tracking-[-0.36px] text-[#3c3c3c]"
                style={{ fontFamily: '"Poppins:Regular"' }}
              >
                {filteredNotifications.length}
              </span>
            </div>
            <TopicChips selected={selectedChip} onSelect={setSelectedChip} />
            <div className="notification-list mt-2 max-h-[474px] overflow-y-auto pr-1">
              {filteredNotifications.length ? (
                filteredNotifications.map((notification) => {
                  const isRead = readIds.includes(notification.id)
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => toggleRead(notification.id)}
                      className={`flex min-h-[79px] w-full items-center gap-4 border-b border-black px-2.5 py-3 text-left transition-colors hover:bg-white md:gap-[27px] ${
                        isRead ? "opacity-55" : ""
                      }`}
                      aria-label={`${
                        isRead ? "Mark unread" : "Mark read"
                      }: ${notification.title}`}
                    >
                      <CategoryBadge category={notification.category} />
                      <span className="min-w-0 flex-1 text-base leading-6 tracking-[-0.48px]">
                        <strong
                          className="block truncate text-black"
                          style={{ fontFamily: '"Poppins:SemiBold"' }}
                        >
                          {notification.title}
                        </strong>
                        <span
                          className="block truncate text-[#5b6472]"
                          style={{ fontFamily: '"Poppins:Regular"' }}
                        >
                          {notification.description}
                        </span>
                      </span>
                      <time
                        className="hidden shrink-0 whitespace-pre text-base leading-6 tracking-[-0.48px] text-[#729acd] sm:block"
                        style={{ fontFamily: '"Poppins:SemiBold"' }}
                      >
                        {notification.time}
                      </time>
                    </button>
                  )
                })
              ) : (
                <p
                  className="py-16 text-center text-[#5b6472]"
                  style={{ fontFamily: '"Poppins:Regular"' }}
                >
                  No notifications match your filters.
                </p>
              )}
            </div>
          </div>

          <section
            className="mt-0 rounded-lg bg-[#f5f7f9] px-[17px] pb-8 pt-4 lg:mx-[25px] lg:min-h-[400px]"
            aria-labelledby="recommended-title"
          >
            <h2
              id="recommended-title"
              className="mb-3 text-base tracking-[-0.48px] text-[#287aaa]"
              style={{ fontFamily: '"Poppins:Bold"' }}
            >
              Recommended
            </h2>
            <div className="grid gap-[47px] sm:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
