import Flow from "@/components/Flow";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Flow flowMoves={config.flowMoves} />;
}
