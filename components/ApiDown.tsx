import { BrandRow } from "./ui";

/** Shown when a page can't reach FastAPI. */
export function ApiDown() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[600px] flex-col gap-4 px-5 pt-4">
      <BrandRow />
      <h1 className="m-0 text-[27px] font-extrabold leading-[1.1]">Can&apos;t reach the server</h1>
      <p className="m-0 text-[15px] text-muted">The API isn&apos;t running. Start it with <code>npm run api</code> and reload.</p>
    </div>
  );
}
