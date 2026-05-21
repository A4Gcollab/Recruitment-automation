"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<
  React.ComponentProps<"input">,
  "type" | "checked" | "onChange"
> & {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
};

/**
 * Minimal styled checkbox.
 *
 * - `checked` accepts `"indeterminate"` for the header "select all when only
 *   some are picked" state — we set the DOM `indeterminate` flag manually
 *   because React does not surface it as a prop.
 * - `onCheckedChange(boolean)` fires on user interaction, mirroring the
 *   shadcn Checkbox API so callers can be swapped later without churn.
 */
function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = checked === "indeterminate";
    }
  }, [checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded-sm border border-input bg-transparent accent-primary",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Checkbox };
