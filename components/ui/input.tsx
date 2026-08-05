import * as React from "react";
import { cn } from "@/lib/utils";

const inputStyles =
  "flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input ref={ref} type={type} className={cn(inputStyles, className)} {...props} />
));
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputStyles, "h-auto min-h-[80px] py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea, inputStyles };
