import { FormEvent, useState } from "react";
import { useRouter } from "next/router";

type ClassValue = string | false | null | undefined;
const cn = (...c: ClassValue[]) => c.filter(Boolean).join(" ");

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-7 items-center gap-[3px]">
        <span className="h-6 w-3 rounded-[2px] bg-black" />
        <span className="h-6 w-3 rounded-[2px] bg-black" />
      </div>
      <span className="text-sm font-bold tracking-tight text-black">
        Hugo
      </span>
    </div>
  );
}

function LoginVisual() {
  const pixels = Array.from({ length: 64 });

  return (
    <div className="relative hidden min-h-[620px] overflow-hidden rounded-[2.5rem] bg-black p-10 text-white lg:block">
      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70">
          Acces prive
        </div>

        <h2 className="mt-8 max-w-sm text-[3rem] font-bold leading-[0.98] tracking-[-0.05em]">
          Hugo garde le fil du cabinet.
        </h2>

        <p className="mt-6 max-w-sm text-sm font-medium leading-7 text-white/50">
          Accedez au cockpit, aux patients, aux prescriptions et aux taches de
          suivi depuis un espace sobre et controle.
        </p>
      </div>

      <div className="absolute bottom-12 left-10 right-10 z-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>Cabinet prive</span>
          <span className="text-blue-300">Live</span>
        </div>

        <div className="mt-6 grid grid-cols-8 gap-2">
          {pixels.map((_, i) => {
            const color =
              i % 13 === 0
                ? "bg-white"
                : i % 9 === 0
                ? "bg-sky-300"
                : i % 5 === 0
                ? "bg-blue-400"
                : "bg-blue-700";

            return (
              <span
                key={i}
                className={cn(
                  "h-4 rounded-[4px]",
                  color,
                  i % 7 === 0 ? "col-span-2" : "col-span-1"
                )}
              />
            );
          })}
        </div>
      </div>

      <div className="absolute right-[-5rem] top-[-5rem] h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
      <div className="absolute bottom-[-6rem] left-[-6rem] h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />

      <div className="absolute right-14 top-16 h-24 w-24 rounded-[1.75rem] bg-blue-500" />
      <div className="absolute right-28 top-44 h-16 w-16 rounded-[1.25rem] bg-sky-300" />
      <div className="absolute right-12 top-64 h-10 w-10 rounded-xl bg-white" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(data.message ?? "Invalid credentials");
      }

      const role = data.role ?? data.user?.role;
      const mustChangePassword =
        data.mustChangePassword ?? data.user?.mustChangePassword;

      if (!role) {
        throw new Error("Role missing from login response");
      }

      localStorage.clear();

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", role);

      if (mustChangePassword) {
        await router.push("/change-password");
        return;
      }

      if (role === "ADMIN") {
        await router.push("/dashboard/admin");
      } else {
        await router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to login");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#ececf1] px-4 py-6 text-black md:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          {/* LEFT LOGIN CARD */}
          <section className="flex items-center">
            <div className="w-full rounded-[2rem] border border-black/10 bg-white p-7 shadow-[0_12px_35px_rgba(15,23,42,0.05)] md:p-10">
              <div className="flex items-center justify-between">
                <LogoMark />

                <a
                  href="/"
                  className="rounded-full border border-black/15 px-4 py-2 text-xs font-semibold text-black no-underline transition-all duration-200 hover:-translate-y-px hover:bg-black hover:text-white"
                >
                  Home
                </a>
              </div>

              <div className="mt-16">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">
                  Acces prive
                </p>

                <h1 className="mt-4 max-w-sm text-[2.6rem] font-bold leading-[0.98] tracking-[-0.05em] text-black md:text-[3.6rem]">
                  Connexion
                </h1>

                <p className="mt-6 max-w-sm text-sm font-medium leading-7 text-black/60">
                  Accès réservé au cabinet.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-10 space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-2xl border border-black/10 bg-[#f4f4f7] px-5 py-4 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-black/10 bg-[#f4f4f7] px-5 py-4 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center rounded-full bg-blue-500 px-6 py-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-blue-600 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Connexion..." : "Se connecter"}
                </button>
              </form>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-black/45">
                <span>Acces securise</span>
                <span>Suivi clair</span>
              </div>
            </div>
          </section>

          {/* RIGHT VISUAL */}
          <LoginVisual />
        </div>
      </div>
    </main>
  );
}
