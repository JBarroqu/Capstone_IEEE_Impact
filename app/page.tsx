import Flow from "@/components/Flow";
import { config, consentCopy } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  // When Gemini is selected but no key is set, the server silently uses the static engine (see getProvider).
  const effective = config.provider === "gemini" && !config.geminiKey ? "static" : config.provider;
  return <Flow provider={effective} consentCopy={consentCopy} />;
}
