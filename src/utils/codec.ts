export function stringify<T>(value: T, space?: string | number | undefined) {
  const seen: any[] = [];
  function replacer(k: string, v: any) {
    if (k && k.startsWith("_")) {
      return undefined;
    } else if (!v || typeof v !== "object" || Array.isArray(v)) {
      return v;
    } else if (v instanceof Date) {
      return v.toJSON();
    } else if (Object.keys(v).length === 0) {
      // No need to save empty records
      return undefined;
    } else if (seen.includes(v)) {
      // Circular reference found, discard key
      return undefined;
    } else {
      seen.push(v);
      return v;
    }
  }

  return JSON.stringify(value, replacer, space);
}

export function encode<T>(value: T, pretty = false) {
  const data = stringify(value, pretty ? 2 : undefined);
  if (!pretty) {
    return window.btoa(encodeURIComponent(data));
  }
  return data;
}

export function decode<T>(data: string): T | undefined {
  if (!data || typeof data !== "string") {
    return (data as T) ?? undefined;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(window.atob(data)));
    if (parsed) {
      return parsed;
    }
  } catch {}
  try {
    const parsed = JSON.parse(data);
    if (parsed) {
      return parsed;
    }
  } catch {}

  return data as T;
}
