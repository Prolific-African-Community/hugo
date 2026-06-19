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

function FlowLines() {
  return (
    <svg
      className="flow-lines pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
    >
      <g
        className="flow-layer flow-layer-a flow-drift-a"
        fill="none"
        stroke="#bfdbfe"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.55"
        opacity="0.32"
      >
        <path d="M-140 622 C 116 506 286 602 472 512 C 654 424 704 292 900 328 C 1118 368 1218 590 1518 530 C 1668 500 1742 448 1810 408" />
        <path d="M-120 708 C 148 600 294 678 500 586 C 694 498 760 382 944 420 C 1134 460 1238 674 1530 634 C 1680 614 1748 558 1820 520" />
        <path d="M-130 548 C 138 430 314 520 496 438 C 674 358 752 230 938 254 C 1140 280 1240 444 1510 398 C 1658 372 1738 318 1812 270" />
      </g>

      <g
        className="flow-layer flow-layer-b flow-drift-b"
        fill="none"
        stroke="#f5ead6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.15"
        opacity="0.24"
      >
        <path d="M72 940 C 332 796 526 872 718 714 C 890 572 852 420 1034 320 C 1226 214 1450 248 1584 84" />
        <path d="M-100 398 C 142 514 294 412 460 334 C 638 252 782 290 944 426 C 1098 554 1216 622 1400 532 C 1526 470 1592 374 1690 318" />
        <path d="M884 982 C 986 752 1198 760 1298 584 C 1392 420 1312 260 1544 92" />
      </g>

      <g
        className="flow-layer flow-layer-c flow-drift-c"
        fill="none"
        stroke="#bae6fd"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.1"
        opacity="0.23"
      >
        <path d="M-90 664 C 132 566 318 646 526 548 C 730 452 812 362 1012 438 C 1216 516 1316 576 1510 494 C 1622 446 1690 388 1770 342" />
        <path d="M-80 744 C 164 664 326 720 548 626 C 754 538 854 480 1052 542 C 1242 602 1378 676 1604 590" />
        <path d="M1010 120 C 1180 42 1356 72 1484 216 C 1594 340 1574 478 1460 582 C 1356 678 1180 664 1066 548" />
      </g>
    </svg>
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(255,255,255,0.98),rgba(251,250,247,0.86)_42%,rgba(244,249,252,0.52)_74%,rgba(251,250,247,0.94))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_73%_72%,rgba(191,219,254,0.16),transparent_31%),radial-gradient(circle_at_20%_22%,rgba(245,234,214,0.4),transparent_29%),radial-gradient(circle_at_48%_64%,rgba(255,255,255,0.86),transparent_40%)]" />
      <FlowLines />

      <div className="sculpture-reveal pointer-events-none absolute bottom-[-12vh] right-[-2vw] z-[2] h-[96vh] min-h-[720px] w-[54vw] max-w-[860px] opacity-[0.82] max-lg:right-[-32vw] max-lg:h-[78vh] max-lg:min-h-[560px] max-lg:w-[118vw] max-lg:opacity-[0.18]">
        <div className="sculpture-float absolute inset-0">
          <img
            src={SKELETON_IMAGE}
            alt=""
            className="skeleton-image h-full w-full object-contain object-bottom mix-blend-multiply"
            draggable={false}
          />
        </div>
      </div>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10 lg:pr-[18vw]">
        <div className="login-card relative w-full max-w-[420px] rounded-[1.75rem] border border-white/80 bg-white/[0.74] px-7 py-8 shadow-[0_30px_100px_rgba(49,66,80,0.08)] backdrop-blur-[18px]">
          <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.62),rgba(255,255,255,0.24)_54%,rgba(219,234,254,0.1))]" />
          <div className="relative">
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

        @keyframes flowDriftA {
          0%,
          100% {
            transform: translate3d(-0.7%, 0.25%, 0);
          }
          50% {
            transform: translate3d(0.7%, -0.25%, 0);
          }
        }

        @keyframes flowDriftB {
          0%,
          100% {
            transform: translate3d(0.55%, -0.3%, 0);
          }
          50% {
            transform: translate3d(-0.55%, 0.35%, 0);
          }
        }

        @keyframes flowDriftC {
          0%,
          100% {
            transform: translate3d(-0.35%, -0.2%, 0);
          }
          50% {
            transform: translate3d(0.45%, 0.24%, 0);
          }
        }

        .login-card {
          animation: cardEntrance 900ms cubic-bezier(0.22, 1, 0.36, 1) 200ms
            both;
          box-shadow: 0 30px 100px rgba(45, 57, 68, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.82);
        }

        .sculpture-reveal {
          animation: sculptureReveal 1.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .sculpture-float {
          animation: sculptureFloat 12s ease-in-out infinite;
        }

        .ambient-light {
          background: radial-gradient(
              circle at 70% 72%,
              rgba(121, 197, 255, 0.2),
              transparent 34%
            ),
            radial-gradient(
              circle at 28% 26%,
              rgba(255, 239, 209, 0.54),
              transparent 32%
            ),
            radial-gradient(
              circle at 48% 50%,
              rgba(255, 255, 255, 0.98),
              transparent 42%
            );
          animation: ambientShift 20s ease-in-out infinite;
          opacity: 0.9;
        }

        .skeleton-image {
          -webkit-mask-image: radial-gradient(
              ellipse at 54% 54%,
              #000 46%,
              rgba(0, 0, 0, 0.72) 64%,
              transparent 88%
            ),
            linear-gradient(
              to right,
              transparent 0%,
              rgba(0, 0, 0, 0.82) 18%,
              #000 54%,
              transparent 99%
            );
          -webkit-mask-composite: source-in;
          mask-image: radial-gradient(
              ellipse at 54% 54%,
              #000 46%,
              rgba(0, 0, 0, 0.72) 64%,
              transparent 88%
            ),
            linear-gradient(
              to right,
              transparent 0%,
              rgba(0, 0, 0, 0.82) 18%,
              #000 54%,
              transparent 99%
            );
          mask-composite: intersect;
          filter: saturate(0.88) contrast(1.04)
            drop-shadow(0 0 44px rgba(152, 211, 255, 0.2));
        }

        .flow-lines {
          opacity: 1;
        }

        .flow-layer {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          vector-effect: non-scaling-stroke;
        }

        .flow-layer path {
          fill: none;
        }

        .flow-layer-a {
          animation: flowDriftA 28s ease-in-out infinite;
          opacity: 0.32;
        }

        .flow-layer-b {
          animation: flowDriftB 34s ease-in-out infinite;
          opacity: 0.24;
        }

        .flow-layer-c {
          animation: flowDriftC 30s ease-in-out infinite;
          opacity: 0.23;
        }

        .login-card :global(input:focus) {
          box-shadow: 0 0 0 4px rgba(193, 230, 255, 0.36),
            0 0 36px rgba(178, 218, 255, 0.16);
        }

        @media (max-width: 900px) {
          .flow-lines {
            opacity: 0.72;
          }

          .flow-layer-c {
            opacity: 0.11;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-card,
          .sculpture-reveal,
          .sculpture-float,
          .ambient-light,
          .flow-layer-a,
          .flow-layer-b,
          .flow-layer-c {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
