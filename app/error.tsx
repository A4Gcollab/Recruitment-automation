"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The app hit an unexpected error. You can try again, or reload the
            page if the problem persists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {error.message}
            {error.digest ? `\n(digest: ${error.digest})` : ""}
          </pre>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
