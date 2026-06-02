"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Sparkles, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result) {
        setError("Sign-in service did not respond. Try again.");
        return;
      }
      if (result.error) {
        setError("Invalid email or password.");
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-500">
      {/* Brand mark — visible on mobile where the side panel is hidden */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-base font-semibold tracking-tight">Omysha Foundation — Recruitment</p>
          <p className="text-xs text-muted-foreground">VONG Movement · AI for Good (A4G)</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
        <div className="mb-6 space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Sign in to the recruitment dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.org"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending}
                className="px-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive animate-in fade-in slide-in-from-top-1 duration-200"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </div>
          ) : null}

          <Button type="submit" className="mt-2 w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Internal tool · authorised access only
      </p>
    </div>
  );
}
