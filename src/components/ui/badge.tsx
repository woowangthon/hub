import type { ComponentProps } from 'react';
import { clsx } from 'clsx';
export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="badge" className={clsx('ui-badge', className)} {...props} />;
}
