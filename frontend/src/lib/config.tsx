import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { get } from "./api";
import type { Catalog, PublicConfig } from "./types";

type Ctx = { config: PublicConfig | null; catalog: Catalog | null; policy: (k: string) => any; reload: () => void };
const C = createContext<Ctx>({ config: null, catalog: null, policy: () => undefined, reload: () => {} });

/** Public policy values (docs/MODULE_OWNER_DECISIONS.md) shape the UI wording, e.g. "Waiting for your buddy". */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    get<PublicConfig & { ok: boolean }>("/api/v1/config").then(setConfig).catch(() => setConfig(null));
    get<Catalog & { ok: boolean }>("/api/v1/catalog").then(setCatalog).catch(() => setCatalog(null));
  }, [n]);
  return <C.Provider value={{ config, catalog, policy: (k) => config?.policies?.[k], reload: () => setN((x) => x + 1) }}>{children}</C.Provider>;
}

export const useConfig = () => useContext(C);
