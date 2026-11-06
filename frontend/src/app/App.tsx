import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Skeleton } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ConfigProvider, useConfig } from "@/lib/config";
import { AppShell, BareShell } from "./AppShell";

const SignIn = lazy(() => import("@/modules/auth/SignIn"));
const SignUp = lazy(() => import("@/modules/auth/SignUp"));
const Callback = lazy(() => import("@/modules/auth/Callback"));
const ResetPassword = lazy(() => import("@/modules/auth/ResetPassword"));
const Onboarding = lazy(() => import("@/modules/profile/Onboarding"));
const ProfilePage = lazy(() => import("@/modules/profile/ProfilePage"));
const HomePage = lazy(() => import("@/modules/feed/HomePage"));
const MovesPage = lazy(() => import("@/modules/wish/MovesPage"));
const NewWish = lazy(() => import("@/modules/wish/NewWish"));
const WishPage = lazy(() => import("@/modules/wish/WishPage"));
const GrowthPage = lazy(() => import("@/modules/growth/GrowthPage"));
const EvidencePage = lazy(() => import("@/modules/growth/EvidencePage"));
const BuddiesPage = lazy(() => import("@/modules/social/BuddiesPage"));
const ReviewPage = lazy(() => import("@/modules/social/ReviewPage"));
const AdminPage = lazy(() => import("@/admin/AdminPage"));

function Loading() {
  return <div className="mx-auto mt-10 flex max-w-[600px] flex-col gap-3 px-5" aria-busy="true"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-32 w-full" /></div>;
}

/** Signed in, and (ONBOARDING_REQUIRED, D-01) onboarded, before the app pages. */
function RequireUser({ children, onboarding = false }: { children: ReactNode; onboarding?: boolean }) {
  const { session, me, loading } = useAuth();
  const { policy } = useConfig();
  const loc = useLocation();
  if (loading || (session && !me)) return <Loading />;
  if (!session) return <Navigate to={`/auth/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!onboarding && me && !me.onboarded && policy("ONBOARDING_REQUIRED") !== false) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  return <RequireUser><AppShell><Suspense fallback={<Loading />}>{children}</Suspense></AppShell></RequireUser>;
}

export function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <AuthProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/auth/sign-in" element={<BareShell><SignIn /></BareShell>} />
              <Route path="/auth/sign-up" element={<BareShell><SignUp /></BareShell>} />
              <Route path="/auth/callback" element={<BareShell><Callback /></BareShell>} />
              <Route path="/auth/reset-password" element={<BareShell><ResetPassword /></BareShell>} />
              <Route path="/onboarding" element={<RequireUser onboarding><BareShell><Onboarding /></BareShell></RequireUser>} />
              <Route path="/admin" element={<BareShell><AdminPage /></BareShell>} />
              <Route path="/" element={<Shell><HomePage /></Shell>} />
              <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
              <Route path="/moves" element={<Shell><MovesPage /></Shell>} />
              <Route path="/moves/new" element={<Shell><NewWish /></Shell>} />
              <Route path="/moves/:wishId" element={<Shell><WishPage /></Shell>} />
              <Route path="/growth" element={<Shell><GrowthPage /></Shell>} />
              <Route path="/growth/evidence/:id" element={<Shell><EvidencePage /></Shell>} />
              <Route path="/buddies" element={<Shell><BuddiesPage /></Shell>} />
              <Route path="/buddies/review/:invitationId" element={<Shell><ReviewPage /></Shell>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}
