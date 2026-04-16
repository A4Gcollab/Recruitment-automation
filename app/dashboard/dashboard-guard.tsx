"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=/dashboard");
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-label="Loading"
        />
      </div>
    );
  }

  return <>{children}</>;
}
