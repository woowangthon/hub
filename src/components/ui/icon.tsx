// Preserve the supplied vector geometry while following system foreground colors.
export function Icon({ src, size }: { src: string; size: number }) {
  return <span aria-hidden="true" className="ui-icon" style={{
    width: size, height: size, maskImage: `url("${src}")`,
  }} />;
}
