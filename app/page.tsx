import Flow from "@/components/Flow";
import { ApiDown } from "@/components/ApiDown";
import { getServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const c = await getServerConfig();
  return c ? <Flow flowMoves={c.flowMoves} /> : <ApiDown />;
}
