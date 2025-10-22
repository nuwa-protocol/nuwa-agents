export const compact = <T extends Record<string, unknown>>(payload: T): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
};

export const ensureAtLeastOne = (
  fields: Array<[string, unknown]>
): void => {
  const hasValue = fields.some(([, value]) => value !== undefined && value !== null && value !== "");
  if (!hasValue) {
    const fieldNames = fields.map(([name]) => name).join(", ");
    throw new Error(`Provide at least one value for: ${fieldNames}`);
  }
};
