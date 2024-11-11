/**
 * Construct the space-separated css class name out of 0 or more object
 */
export default function className<T>(
  val: T | T[],
  ...rest: T[]
): string | undefined {
  const classes = [...(Array.isArray(val) ? val : [val]), ...rest]
    .map((s) => (s ? String(s) : undefined))
    .filter((s) => !!s)
    .filter((s, i, c) => c.indexOf(s) === i)
    .join(" ");
  return !!classes ? classes : undefined;
}
