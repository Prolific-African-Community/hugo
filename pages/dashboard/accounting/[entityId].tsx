import { useEffect } from "react";
import { useRouter } from "next/router";

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#ececf1]";
const CARD =
  "rounded-[1.5rem] border border-black/10 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.05)]";

export default function LegacyAccountingRedirect() {
  const router = useRouter();
  const entityId =
    typeof router.query.entityId === "string"
      ? router.query.entityId
      : undefined;

  useEffect(() => {
    if (!entityId) return;
    router.replace(`/dashboard/entity/${entityId}`);
  }, [entityId, router]);

  return (
    <main className={cn(PAGE_BG, "min-h-screen px-6 py-20 text-black")}>
      <div className="mx-auto max-w-2xl">
        <div className={cn(CARD, "p-8 text-center")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
            Legacy route
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
            Redirecting to the entity workspace
          </h1>
          <p className="mt-3 text-sm font-medium text-black/50">
            This temporary route now opens the Hugo workspace.
          </p>
        </div>
      </div>
    </main>
  );
}
