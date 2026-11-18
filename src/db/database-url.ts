export function normalizeDatabaseUrl(value: string) {
  if (value.startsWith("file:./"))
    return `file://${value.slice("file:./".length)}`;
  return value;
}

export function localDatabaseDirectory(value: string) {
  const normalized = normalizeDatabaseUrl(value);
  if (!normalized.startsWith("file://")) return null;
  const path = normalized.slice("file://".length);
  const separator = path.lastIndexOf("/");
  return separator > 0 ? path.slice(0, separator) : null;
}
