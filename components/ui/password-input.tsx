"use client";

import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  const [show, setShow] = React.useState(false);

  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        placeholder="••••••••"
        className={cn("pl-9 pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
