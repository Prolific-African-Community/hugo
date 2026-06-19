import { FormEvent, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const SKELETON_IMAGE = "/squelette.png";

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-7 items-center gap-[3px]">
        <span className="h-6 w-3 rounded-[2px] bg-black" />
        <span className="h-6 w-3 rounded-[2px] bg-black" />
      </div>
      <span className="text-sm font-bold tracking-tight text-black">Hugo</span>
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
    <main className="relative min-h-screen overflow-hidden bg-[#fbfaf7] text-black">
      <Head>
        <title>Cabinet Hugo | Connexion</title>
        <meta
          name="description"
          content="Connexion au cockpit privé du cabinet Hugo."
        />
      </Head>

      <div className="ambient-light absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_54%_48%,rgba(255,255,255,0.96),rgba(251,250,247,0.78)_38%,rgba(239,244,247,0.44)_72%,rgba(251,250,247,0.86))]" />

      <div className="sculpture-reveal pointer-events-none absolute left-1/2 top-1/2 z-0 h-[80vh] min-h-[620px] w-[64vw] max-w-[760px] -translate-y-1/2 translate-x-[-2%] opacity-[0.82] max-lg:left-[58%] max-lg:h-[68vh] max-lg:min-h-[480px] max-lg:w-[92vw] max-lg:opacity-[0.28]">
        <div className="sculpture-float absolute inset-0">
          <img
            src={SKELETON_IMAGE}
            alt=""
            className="skeleton-image h-full w-full object-contain object-center mix-blend-multiply"
            draggable={false}
          />
        </div>
      </div>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="login-card relative w-full max-w-[392px] rounded-[1.65rem] border border-black/[0.07] bg-white/64 px-6 py-7 shadow-[0_22px_80px_rgba(30,38,48,0.075)] backdrop-blur-2xl">
          <LogoMark />

          <div className="mt-10">
            <h1 className="text-3xl font-bold tracking-[-0.045em]">
              Bienvenue, Hugo
            </h1>
            <p className="mt-2 text-sm font-semibold text-black/45">
              Connexion au cockpit.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="w-full rounded-2xl border border-black/10 bg-white/68 px-4 py-3.5 text-sm font-medium text-black outline-none transition duration-300 placeholder:text-black/25 focus:border-cyan-300/45 focus:bg-white/90 focus:ring-4 focus:ring-cyan-100/45"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                Mot de passe
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-2xl border border-black/10 bg-white/68 px-4 py-3.5 text-sm font-medium text-black outline-none transition duration-300 placeholder:text-black/25 focus:border-cyan-300/45 focus:bg-white/90 focus:ring-4 focus:ring-cyan-100/45"
              />
            </label>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-sm font-semibold text-white transition duration-300 hover:-translate-y-px hover:bg-neutral-800 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? "Connexion..." : "Connexion"}
            </button>
          </form>
        </div>
      </section>

      <style jsx>{`
        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes sculptureReveal {
          from {
            opacity: 0;
            transform: scale(0.97);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes sculptureFloat {
          0%,
          100% {
            transform: translateY(-12px);
          }
          50% {
            transform: translateY(12px);
          }
        }

        @keyframes ambientShift {
          0%,
          100% {
            transform: translate3d(-1%, -1%, 0) scale(1);
          }
          50% {
            transform: translate3d(2%, 2%, 0) scale(1.02);
          }
        }

        .login-card {
          animation: cardEntrance 900ms cubic-bezier(0.22, 1, 0.36, 1) 200ms
            both;
        }

        .sculpture-reveal {
          animation: sculptureReveal 1.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .sculpture-float {
          animation: sculptureFloat 12s ease-in-out infinite;
        }

        .ambient-light {
          background: radial-gradient(
              circle at 64% 48%,
              rgba(125, 190, 255, 0.13),
              transparent 32%
            ),
            radial-gradient(
              circle at 48% 48%,
              rgba(255, 255, 255, 0.94),
              transparent 36%
            );
          animation: ambientShift 20s ease-in-out infinite;
          opacity: 0.9;
        }

        .skeleton-image {
          -webkit-mask-image: radial-gradient(
            ellipse at center,
            #000 52%,
            rgba(0, 0, 0, 0.58) 70%,
            transparent 91%
          );
          mask-image: radial-gradient(
            ellipse at center,
            #000 52%,
            rgba(0, 0, 0, 0.58) 70%,
            transparent 91%
          );
        }
      `}</style>
    </main>
  );
}
