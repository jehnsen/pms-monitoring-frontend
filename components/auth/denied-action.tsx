"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Wraps a control the current role may not use.
 *
 * Blocked actions stay on screen, dimmed, with a tooltip saying why — hiding
 * them instead would leave people wondering whether the feature exists or the
 * app is broken, and makes the permission model invisible.
 */
export function DeniedAction({
  reason,
  children,
}: {
  reason: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-disabled="true"
          className="inline-flex cursor-not-allowed rounded-md opacity-50 [&>*]:pointer-events-none"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
