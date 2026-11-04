// shadcn/ui Card slots, with project-native CSS instead of Tailwind utilities.
import type { ComponentProps } from 'react';
import { clsx } from 'clsx';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={clsx('ui-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={clsx('ui-card-header', className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={clsx('ui-card-footer', className)} {...props} />;
}
