import Flow from "@/components/Flow";
import { config, consentCopy } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Flow provider={config.provider} consentCopy={consentCopy} />;
}
