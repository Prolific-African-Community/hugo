import Head from "next/head";

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#ececf1]";
const CARD =
  "rounded-[1.5rem] border border-black/10 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]";
const BTN_DARK =
  "inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white no-underline shadow-sm transition hover:-translate-y-px hover:bg-slate-800";
const BTN_OUTLINE =
  "inline-flex items-center justify-center rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-semibold text-black no-underline shadow-sm transition hover:-translate-y-px hover:border-black hover:bg-black hover:text-white";

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-7 items-center gap-[3px]">
        <span className="h-6 w-3 rounded-[2px] bg-black" />
        <span className="h-6 w-3 rounded-[2px] bg-black" />
      </div>
      <span className="text-sm font-bold tracking-tight">Hugo</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className={cn(PAGE_BG, "min-h-screen text-black")}>
      <Head>
        <title>Hugo | Assistant digital pour cabinet</title>
        <meta
          name="description"
          content="Hugo prepare un cockpit sobre pour organiser clients, rendez-vous, taches, documents, suivi et factures."
        />
      </Head>

      <header className="border-b border-black/5 bg-[#ececf1]/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-6">
          <LogoMark />
          <a href="/login" className={BTN_OUTLINE}>
            Se connecter
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-500">
            Cockpit cabinet
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.06em] md:text-7xl">
            Hugo prepare un espace de travail clair pour le quotidien du cabinet.
          </h1>
          <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-black/58">
            Cette base temporaire met l'interface au propre avant d'ajouter les
            vrais modules metier : clients, rendez-vous, taches, documents,
            suivi et factures.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="/login" className={BTN_DARK}>
              Ouvrir Hugo
            </a>
          </div>
        </div>

        <div className={cn(CARD, "p-6")}>
          <div className="grid gap-4">
            {[
              ["Rendez-vous", "Vue du jour"],
              ["Clients", "Liste active"],
              ["Taches", "Suivi simple"],
              ["Documents", "Espace securise"],
              ["Factures", "Preparation"],
            ].map(([label, detail], index) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl border border-black/5 bg-[#f7f7f9] px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs font-medium text-black/45">
                    {detail}
                  </p>
                </div>
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    index === 0 ? "bg-blue-500" : "bg-black/12"
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
