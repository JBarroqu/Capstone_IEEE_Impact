import { consentCopy } from "@/lib/config";
import { remoteServices } from "@/lib/providers/backends";
import { BrandRow } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Study terms - Wish Engine" };

/** Full consent text, linked from the welcome screen ("By continuing you agree to the study terms"). */
export default function Terms() {
  const remote = remoteServices();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[600px] flex-col gap-5 px-5 pb-10 pt-4">
      <BrandRow />
      <h1 className="m-0 text-[27px] font-extrabold leading-[1.1]">Study terms</h1>
      <div className="flex flex-col gap-4 rounded-[14px] border border-line2 bg-white p-5 text-[15px] leading-[1.55]">
        <p className="m-0">{consentCopy.intro}</p>
        <p className="m-0">{remote.length ? consentCopy.remote(remote) : consentCopy.local}</p>
      </div>
      <a href="/" className="text-[15px] font-bold text-blue hover:text-ink">Back to the start</a>
    </div>
  );
}
