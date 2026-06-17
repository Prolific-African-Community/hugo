import { useState } from "react";
import { useRouter } from "next/router";

export default function ChangePassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);

    await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    setLoading(false);
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#ececf1] px-4 text-black">
      <div className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-8 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-500">
          Secure access
        </p>
        <h1 className="mt-3 mb-3 text-2xl font-bold tracking-[-0.04em]">
          Change your password
        </h1>
        <p className="mb-6 text-sm font-medium leading-6 text-black/55">
          Set a new password before entering your Hugo workspace.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="password"
            placeholder="New password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-black/10 bg-[#f4f4f7] px-5 py-4 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-black py-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-slate-800 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
