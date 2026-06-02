// Recursively collect every string value in a JSON value, paired with a JSONPath
// pointing at it. Shared by predicate adapters that scan disclosed output text
// (pii-absence, url-derived). Arrays and nested objects are traversed; non-string
// leaves are ignored.

export type StringHit = [path: string, value: string];

export function collectStrings(value: unknown, path = '$', out: StringHit[] = []): StringHit[] {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(v, path === '$' ? `$.${k}` : `${path}.${k}`, out);
    }
  }
  return out;
}
