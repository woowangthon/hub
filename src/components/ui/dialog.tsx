// shadcn/ui Dialog adapted to the existing CSS and installed Radix packages.
import * as Primitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { clsx } from 'clsx';
export const Dialog = Primitive.Root;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Overlay className="detail-overlay" />
    <Primitive.Content className={clsx('detail-dialog', className)} {...props}>{children}</Primitive.Content>
  </Primitive.Portal>;
}
