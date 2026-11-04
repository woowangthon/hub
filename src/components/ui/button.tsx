// Adapted from shadcn/ui new-york-v4 to the existing CSS token system.
import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import './ui.css';

const buttonVariants = cva('ui-button', {
  variants: {
    variant: { outline: 'ui-button-outline', ghost: 'ui-button-ghost' },
    size: { default: 'ui-button-default', icon: 'ui-button-icon' },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
});
export function Button({ className, variant, size, asChild = false, ...props }:
  ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={clsx(buttonVariants({ variant, size }), className)} {...props} />;
}
