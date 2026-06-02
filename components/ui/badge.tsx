import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Small, purely-presentational pill. The colour is supplied by the caller via
 * `className` so callers can map domain values (e.g. candidate stage) to a
 * sensible palette without this component knowing anything about the domain.
 */
function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
