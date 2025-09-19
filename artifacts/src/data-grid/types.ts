// Basic types and helpers for the data grid
// Column types are limited to simple primitives for v1

export type ColumnType = "text" | "number" | "boolean" | "markdown" | "uri" | "date";

export type Column = {
  id: string;
  title: string;
  type: ColumnType;
  width?: number;
};

export type Row = {
  id: string;
  // values keyed by column id
  values: Record<string, any>;
};

export type GridState = {
  columns: Column[];
  rows: Row[];
};

// Simple id generator that is stable enough for local grid operations
export function genId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// Coerce a raw value to the specified column type.
// Keep undefined/null as undefined. Return best-effort conversion.
export function coerceValue(val: unknown, type: ColumnType): any {
  if (val === null || val === undefined) return undefined;
  switch (type) {
    case "text": {
      if (typeof val === "string") return val;
      try {
        // stringify objects for visibility
        return String(val);
      } catch {
        return "";
      }
    }
    case "markdown": {
      if (typeof val === "string") return val;
      try {
        return String(val);
      } catch {
        return "";
      }
    }
    case "number": {
      if (typeof val === "number" && Number.isFinite(val)) return val;
      const n = typeof val === "string" ? Number(val.trim()) : Number(val);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean": {
      if (typeof val === "boolean") return val;
      if (typeof val === "number") return val !== 0;
      if (typeof val === "string") {
        const s = val.trim().toLowerCase();
        if (s === "true" || s === "yes" || s === "y" || s === "1") return true;
        if (s === "false" || s === "no" || s === "n" || s === "0") return false;
      }
      return undefined;
    }
    case "uri": {
      if (typeof val === "string") return val.trim();
      try {
        return String(val);
      } catch {
        return "";
      }
    }
    case "date": {
      // Store as YYYY-MM-DD string for simplicity
      const toISODate = (d: Date) => {
        const year = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${m}-${day}`;
      };
      if (val instanceof Date && !isNaN(val.getTime())) return toISODate(val);
      if (typeof val === "number") {
        const d = new Date(val);
        return isNaN(d.getTime()) ? undefined : toISODate(d);
      }
      if (typeof val === "string") {
        const trimmed = val.trim();
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? trimmed : toISODate(d);
      }
      return undefined;
    }
    default:
      return val;
  }
}

// Change a column's type and attempt to coerce existing values.
export function migrateColumnType(state: GridState, columnId: string, nextType: ColumnType): GridState {
  const col = state.columns.find((c) => c.id === columnId);
  if (!col || col.type === nextType) return state;
  const columns = state.columns.map((c) => (c.id === columnId ? { ...c, type: nextType } : c));
  const rows = state.rows.map((r) => {
    const v = r.values[columnId];
    return { ...r, values: { ...r.values, [columnId]: coerceValue(v, nextType) } };
  });
  return { columns, rows };
}

// Create a shallow, empty row matching existing columns (values set to undefined)
export function makeEmptyRow(columns: Column[], id?: string): Row {
  const values: Record<string, any> = {};
  for (const c of columns) values[c.id] = undefined;
  return { id: id ?? genId("row"), values };
}

// Sample data for initial load if no persisted state exists
export function sampleGridState(): GridState {
  const columns: Column[] = [
    { id: genId("col"), title: "First Name", type: "text", width: 140 },
    { id: genId("col"), title: "Last Name", type: "text", width: 140 },
    { id: genId("col"), title: "Age", type: "number", width: 80 },
    { id: genId("col"), title: "Active", type: "boolean", width: 100 },
    { id: genId("col"), title: "Website", type: "uri", width: 200 },
    { id: genId("col"), title: "Bio", type: "markdown", width: 220 },
    { id: genId("col"), title: "Birthday", type: "date", width: 120 },
  ];
  const [c1, c2, c3, c4, c5, c6, c7] = columns.map((c) => c.id);
  const rows: Row[] = [
    {
      id: genId("row"),
      values: {
        [c1]: "John",
        [c2]: "Doe",
        [c3]: 31,
        [c4]: true,
        [c5]: "https://example.com",
        [c6]: "**Engineer** at Example",
        [c7]: "1990-02-14",
      },
    },
    {
      id: genId("row"),
      values: {
        [c1]: "Maria",
        [c2]: "Garcia",
        [c3]: 28,
        [c4]: false,
        [c5]: "https://acme.org",
        [c6]: "Loves writing docs",
        [c7]: "1994-07-03",
      },
    },
  ];
  return { columns, rows };
}
