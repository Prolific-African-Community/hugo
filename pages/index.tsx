import Head from "next/head";

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");

const PAGE_BG = "bg-[#f6f5f2]";
const CONTAINER = "mx-auto w-full max-w-7xl px-6";
const BUTTON_PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-black px-6 py-3.5 text-sm font-semibold text-white no-underline shadow-[0_18px_35px_rgba(0,0,0,0.16)] transition hover:-translate-y-px hover:bg-neutral-800";
const BUTTON_SECONDARY =
  "inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold text-black no-underline shadow-sm transition hover:-translate-y-px hover:border-black/25";
const CARD =
  "rounded-[1.5rem] border border-black/8 bg-white shadow-[0_22px_70px_rgba(20,20,20,0.07)]";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600";

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

function MiniMetric({
  label,
  value,
  detail,
  active,
}: {
  label: string;
  value: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-[1.1rem] border border-black/7 bg-white p-4 shadow-[0_12px_30px_rgba(20,20,20,0.045)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-black/45">{label}</p>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            active ? "bg-blue-500" : "bg-black/12"
          )}
        />
      </div>
      <p className="mt-4 text-3xl font-bold tracking-[-0.05em]">{value}</p>
      <p className="mt-1 text-xs font-medium text-black/45">{detail}</p>
    </div>
  );
}

function CockpitMockup() {
  return (
    <div className="relative">
      <div className="absolute inset-8 rounded-[2rem] bg-blue-500/8 blur-3xl" />
      <div className={cn(CARD, "relative overflow-hidden p-4 sm:p-5")}>
        <div className="rounded-[1.25rem] border border-black/6 bg-[#fbfaf8] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-black/40">
                Aujourd'hui
              </p>
              <h3 className="mt-1 text-xl font-bold tracking-[-0.04em]">
                Cockpit cabinet
              </h3>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
              A jour
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MiniMetric
              label="Journee"
              value="8"
              detail="actions a suivre"
              active
            />
            <MiniMetric label="Factures" value="3" detail="a preparer" />
            <MiniMetric label="Seances" value="12" detail="restantes" />
            <MiniMetric label="Taches" value="5" detail="prioritaires" />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-[1.1rem] border border-black/7 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-black/45">
                  Planning
                </p>
                <p className="text-xs font-semibold text-blue-600">
                  14:00 libre
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["09:00", "Bilan", "Pret"],
                  ["10:30", "Seance", "Prescription 4/9"],
                  ["13:15", "Suivi", "Document manquant"],
                ].map(([time, title, status]) => (
                  <div
                    key={`${time}-${title}`}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-[#f6f5f2] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="mt-1 text-xs font-medium text-black/42">
                        {time}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-black/50">
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.1rem] border border-black/7 bg-black p-4 text-white">
              <p className="text-xs font-semibold text-white/45">
                Prochaine action
              </p>
              <h4 className="mt-5 text-2xl font-bold tracking-[-0.05em]">
                Preparer 3 factures avant vendredi.
              </h4>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/12">
                <div className="h-full w-2/3 rounded-full bg-blue-400" />
              </div>
              <p className="mt-3 text-xs font-medium text-white/45">
                Hugo regroupe les seances terminees et les pieces utiles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProblemSection() {
  const frustrations = [
    "Suivi manuel des seances",
    "Factures preparees trop tard",
    "Journee difficile a organiser",
    "Documents disperses",
    "Taches repetitives",
  ];

  return (
    <section id="decouvrir" className="border-y border-black/6 bg-white py-20">
      <div className={CONTAINER}>
        <div className="max-w-2xl">
          <p className={EYEBROW}>Le probleme</p>
          <h2 className="mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.055em] md:text-5xl">
            Le cabinet avance vite. L'administratif doit rester sous controle.
          </h2>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-5">
          {frustrations.map((item, index) => (
            <div
              key={item}
              className="rounded-[1.25rem] border border-black/7 bg-[#f7f7f5] p-5"
            >
              <p className="text-xs font-semibold text-black/35">
                0{index + 1}
              </p>
              <p className="mt-8 text-sm font-semibold leading-6 text-black/75">
                {item}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  const pillars = [
    [
      "Patients",
      "Retrouvez rapidement les informations utiles et les suivis en cours.",
    ],
    [
      "Seances",
      "Gardez une vision claire des seances realisees et restantes.",
    ],
    [
      "Facturation",
      "Reperez les factures a preparer avant qu'elles deviennent urgentes.",
    ],
    [
      "Agenda",
      "Gardez une vision simple de la journee et des priorites du cabinet.",
    ],
  ];

  return (
    <section className="py-20 md:py-28">
      <div className={CONTAINER}>
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className={EYEBROW}>La solution</p>
            <h2 className="mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.055em] md:text-5xl">
              Hugo est votre assistant de cabinet.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pillars.map(([title, copy]) => (
              <div key={title} className={cn(CARD, "p-6")}>
                <p className="text-xl font-bold tracking-[-0.04em]">
                  {title}
                </p>
                <p className="mt-4 text-sm font-medium leading-7 text-black/55">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const steps = ["Patient", "Prescription", "Seances", "Facture"];

  return (
    <section className="bg-black py-20 text-white md:py-24">
      <div className={CONTAINER}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">
            Workflow
          </p>
          <h2 className="mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.055em] md:text-5xl">
            Du patient a la facture, le suivi reste simple.
          </h2>
        </div>

        <div className="mt-12 grid gap-3 md:grid-cols-4">
          {steps.map((step, index) => (
            <div
              key={step}
              className="relative rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-5"
            >
              <p className="text-xs font-semibold text-white/35">
                Etape {index + 1}
              </p>
              <p className="mt-10 text-xl font-bold tracking-[-0.04em]">
                {step}
              </p>
              {index < steps.length - 1 && (
                <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-white/25 md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CockpitPreviewSection() {
  return (
    <section className="py-20 md:py-28">
      <div className={CONTAINER}>
        <div className="mx-auto max-w-3xl text-center">
          <p className={EYEBROW}>Apercu cockpit</p>
          <h2 className="mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.055em] md:text-5xl">
            Tout ce qui compte, visible des l'ouverture.
          </h2>
        </div>
        <div className="mx-auto mt-12 max-w-5xl">
          <CockpitMockup />
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className={cn(PAGE_BG, "min-h-screen overflow-hidden text-black")}>
      <Head>
        <title>Hugo | Assistant prive de cabinet</title>
        <meta
          name="description"
          content="Hugo est l'assistant digital prive du cabinet pour suivre les patients, les prescriptions, les seances et les taches du quotidien."
        />
      </Head>

      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f6f5f2]/86 backdrop-blur-xl">
        <nav className={cn(CONTAINER, "flex items-center justify-between py-5")}>
          <LogoMark />
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="hidden text-sm font-semibold text-black/55 no-underline transition hover:text-black sm:inline"
            >
              Connexion
            </a>
            <a href="/login" className={BUTTON_SECONDARY}>
              Connexion
            </a>
          </div>
        </nav>
      </header>

      <section className={cn(CONTAINER, "grid gap-12 pb-20 pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-28 lg:pt-24")}>
        <div>
          <p className={EYEBROW}>Assistant digital privé pour la gestion quotidienne du cabinet.</p>
          <h1 className="mt-5 max-w-3xl text-6xl font-black leading-[0.92] tracking-[-0.07em] md:text-7xl lg:text-8xl">
            Hugo est votre
            <br />
            assistant de cabinet.
          </h1>
          <p className="mt-7 max-w-xl text-lg font-medium leading-8 text-black/58">
            Un espace prive pour suivre les patients, les prescriptions, les
            seances, les documents et les taches du quotidien.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="/login" className={BUTTON_PRIMARY}>
              Connexion
            </a>
            <a href="/login" className={BUTTON_SECONDARY}>
              Connexion
            </a>
          </div>
        </div>

        <CockpitMockup />
      </section>

      <ProblemSection />
      <SolutionSection />
      <WorkflowSection />
      <CockpitPreviewSection />

      <section className="px-6 pb-20 md:pb-28">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-black px-7 py-12 text-center text-white shadow-[0_28px_80px_rgba(0,0,0,0.22)] md:px-12 md:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">
            Acces prive
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-[1.02] tracking-[-0.055em] md:text-6xl">
            Votre cabinet reste clair.
            <br />
            Hugo garde le fil.
          </h2>
          <div className="mt-8">
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black no-underline shadow-sm transition hover:-translate-y-px"
            >
              Connexion
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
