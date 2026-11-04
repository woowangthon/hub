// shadcn/ui InputGroup composition; only the used inline addon is included.
import type { ComponentProps } from 'react';
import { clsx } from 'clsx';

export function InputGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="input-group" role="group" className={clsx('ui-input-group', className)} {...props} />;
}
export function InputGroupAddon({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="input-group-addon" data-align="inline-start" className={clsx('ui-input-addon', className)}
    onClick={event => {
      if (!(event.target as HTMLElement).closest('button')) event.currentTarget.parentElement?.querySelector('input')?.focus();
    }} {...props} />;
}
export function InputGroupInput({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input-group-control" className={clsx('ui-input', className)} {...props} />;
}
