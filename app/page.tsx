import Flow from "@/components/Flow";
import { config, consentCopy } from "@/lib/config";
import { remoteServices } from "@/lib/providers/backends";

export const dynamic = "force-dynamic";

export default function Home() {
  const remote = config.provider === "static" ? [] : remoteServices();
  const consent = { intro: consentCopy.intro, data: remote.length ? consentCopy.remote(remote) : consentCopy.local };
  return <Flow consentCopy={consent} />;
}
