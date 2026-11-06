/** API shapes (contracts in docs/CONTRACTS.md; generated JSON Schemas in /contracts/schemas). */
export type Category = "Social" | "Pro" | "Enablement" | "Impact" | "Events" | "Growth";
export type Tier = "Not started" | "Familiar" | "Proficient" | "Demonstrated" | "Verified";

export type Contribution = { id?: string | null; title: string; type: "project" | "coursework" | "professional" | "other"; description: string; verificationStatus: "self_reported" | "verified"; evidenceId?: string | null };
export type ProfessionalState = {
  schemaVersion: "0.1"; userId: string; handle: string | null; displayName: string; headline: string; bio: string;
  education: { institution: string; major: string; gradYear?: number | null }; position: string; targetCareerId: string | null;
  skills: string[]; interests: string[]; strengths: string[]; growthAreas: string[]; featuredContributions: Contribution[];
  onboardingCompletedAt: string | null; version: number;
};

export type Skill = { id: string; name: string; core?: boolean };
export type Career = { id: string; name: string; skills: Skill[] };
export type Opportunity = { id: string; name: string; tier: Tier; kind: string; description: string };
export type Catalog = { version: string; careers: Career[]; opportunities: Opportunity[] };

export type Move = {
  id: string; key: string; title: string; detail: string; step: number; minutes: number; cost: "free" | "paid"; format: string;
  focus: string[]; domains: string[]; archetypeFit?: Record<string, number>; activityType: string; difficulty: string; skillId: string; careerId?: string | null;
};
export type OptionsMeta = { usedProvider: string; requestedProvider: string; model?: string; promptVersion?: string; latencyMs: number; cacheHit: boolean; repaired: boolean; relaxed: boolean; sources: string[]; tried?: string[] };
export type SelectedSummary = { selectedMoveId: string; step: number; status: string; title: string; detail: string; minutes: number; cost: string; format: string; activityType: string; difficulty: string; skillId: string; selectedAt: string; wishId?: string; wishText?: string };
export type Wish = { id: string; text: string; status: string; type: string | null; focus: string[]; domains: string[]; why: string | null; createdAt: string; moves: SelectedSummary[]; nextStep: number; nextOpen: boolean };
export type SelectedMove = { selectedMoveId: string; userId: string; wishId: string; status: string; wish: { text: string }; move: Move; selection: { step: number; position: number } };

export type Evidence = {
  id: string; selectedMoveId: string; skillId: string; activityType: string; difficulty: string; difficultyFinal: string | null;
  artifactType: "link" | "file" | "text"; artifactUrl: string | null; fileName: string | null; hasFile: boolean; summary: string; status: string;
  aiScore: number | null; aiConfidence: number | null; aiFeedback: string | null; aiCriteria: Record<string, number>; finalQuality: number | null;
  peerConfirmed: boolean | null; createdAt: string; finalizedAt: string | null; points: number | null; pendingPoints?: number | null; ownerId?: string;
};
export type SkillState = { skillId: string; name: string; core: boolean; points: number; pendingPoints: number; tier: Tier; nextTier: Tier | null; nextThreshold: number | null; progress: number; gates: { rule: string; met: boolean }[] };
export type Unlock = { opportunityId: string; title: string; tier: Tier; kind: string; description: string; unlockedAt: string | null };
export type GrowthState = {
  userId: string; careerId: string | null; rulesVersion: string; catalogVersion: string;
  totals: { validated: number; pending: number; effortRaw: number; effortCounted: number; effortBanked: number; impact: number };
  roleTier: Tier; skills: SkillState[]; unlocks: Unlock[]; lockedOpportunities: Unlock[];
  badges: { id: string; name: string; rarity: string; description: string; earned: boolean }[];
  recentOutcomes: { evidenceId: string; selectedMoveId: string; skillId: string; status: string; aiScore: number | null; points: number | null; feedbackSummary: string | null; buddyComment: string | null }[];
};

export type Person = { handle: string | null; displayName: string };
export type Invitation = { id: string; selectedMoveId: string; role: "reviewer" | "tester"; status: string; message: string | null; createdAt: string; owner: Person | null; buddy: Person | null; move: { title: string; detail: string; status: string; wishText: string; skillId: string } | null };
export type ReviewItem = { invitationId: string; role: "reviewer" | "tester"; selectedMoveId: string; owner: Person | null; move: { title: string; detail: string } | null; evidence: Evidence | null; needsFeedback: boolean };

export type FeedItem = { id: string; category: Category; kind: string; title: string; body: string; link: string | null; createdAt: string; readAt: string | null };
export type BestNextMove = { kind: string; reason: string; priority: number; link: string | null };
export type Home = {
  profileCard: { displayName: string; handle: string | null; headline: string; targetCareer: string | null };
  growthSummary: { impact: number; validated: number; pending: number; effortCounted: number; roleTier: Tier; skills: SkillState[]; unlocks: number };
  eventContext: { lastSeenAt: string | null; previousSeenAt: string | null; whileYouWereAway: { count: number; byCategory: Record<string, number>; items: FeedItem[] } };
  bestNextMove: BestNextMove; activeMoves: SelectedSummary[];
};

export type PublicConfig = { policies: Record<string, any>; appVersion: string; modelServices: string[]; privacy: string };
