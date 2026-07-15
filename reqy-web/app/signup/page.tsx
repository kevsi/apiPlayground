"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionStore } from "@/lib/session-store";

export default function SignupPage() {
  const router = useRouter();
  const signup = useSessionStore((s) => s.signup);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim(), password, name.trim() || undefined);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'inscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Créer un compte</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Reqly synchronise vos collections, environnements et dossiers entre vos appareils.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nom (optionnel)</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Votre nom"
            />
          </label>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Au moins 8 caractères"
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
            {loading ? "Création…" : "Créer mon compte"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
