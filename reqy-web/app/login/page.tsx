"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/lib/session-store";

export default function LoginPage() {
  const router = useRouter();
  const login = useSessionStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Connexion</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Accédez à vos espaces de travail synchronisés.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="vous@exemple.com"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Mot de passe</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </label>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </main>
  );
}
