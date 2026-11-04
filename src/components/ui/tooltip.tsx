// shadcn/ui Tooltip keeps Radix keyboard, dismissal and portal behavior.
import type { ComponentProps } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { clsx } from 'clsx';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content data-slot="tooltip-content" sideOffset={sideOffset}
    className={clsx('ui-tooltip', className)} {...props} /></TooltipPrimitive.Portal>;
}
