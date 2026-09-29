import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { loadData, parseFilters } from "@/lib/admin-data";
import { choicesRows, eventsRows, feedbackRows, leaderboard } from "@/lib/analytics";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const { kind } = await params;
  const d = await loadData(parseFilters(new URL(req.url).searchParams));
  const rows =
    kind === "events" ? eventsRows(d.events)
    : kind === "choices" ? choicesRows(d.events, d.wishes)
    : kind === "feedback" ? feedbackRows(d.events, d.wishes)
    : kind === "moves" ? leaderboard(d.events, d.meta)
    : null;
  if (!rows) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}.csv"` },
  });
}
