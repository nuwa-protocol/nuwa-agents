import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type NuwaClient, PostMessageMCPTransport } from "@nuwa-ai/ui-kit";
import { useEffect } from "react";
import { z } from "zod";
import type { Column, ColumnType, GridState, Row } from "../types";
import { coerceValue, genId, makeEmptyRow, migrateColumnType } from "../types";

// Helper: JSON response wrapper with narrow type literal for MCP content
type ToolResponse = { content: { type: "text"; text: string }[] };
function jsonContent(obj: any): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

export function useGridMCP(
  grid: GridState,
  setGrid: (next: GridState) => void,
  nuwaClient: NuwaClient,
) {
  useEffect(() => {
    const transport = new PostMessageMCPTransport({
      targetWindow: window.parent,
      targetOrigin: "*",
      allowedOrigins: ["*"],
      debug: true,
      timeout: 10000,
    });

    const server = new McpServer({ name: "data-grid-mcp", version: "1.0.0" });

    // Read tools
    server.registerTool(
      "get_grid",
      { title: "Get Grid", description: "Return full grid state", inputSchema: {} },
      async () => jsonContent(grid),
    );

    server.registerTool(
      "get_columns",
      { title: "Get Columns", description: "Return list of columns", inputSchema: {} },
      async () => jsonContent(grid.columns),
    );

    server.registerTool(
      "get_rows",
      { title: "Get Rows", description: "Return list of rows", inputSchema: {} },
      async () => jsonContent(grid.rows),
    );

    server.registerTool(
      "get_as_markdown_table",
      {
        title: "Get As Markdown Table",
        description: "Return first N rows rendered as a Markdown table",
        inputSchema: { limit: z.number().int().min(1).max(100).default(20) },
      },
      async ({ limit }) => {
        const cols = grid.columns;
        const rows = grid.rows.slice(0, limit ?? 20);
        const header = `| ${cols.map((c) => c.title).join(" | ")} |`;
        const sep = `| ${cols.map(() => "---").join(" | ")} |`;
        const body = rows
          .map((r) => {
            const cells = cols.map((c) => {
              const v = r.values[c.id];
              return v == null ? "" : String(v);
            });
            return `| ${cells.join(" | ")} |`;
          })
          .join("\n");
        return jsonContent([header, sep, body].filter(Boolean).join("\n"));
      },
    );

    // Write tools
    server.registerTool(
      "set_grid",
      {
        title: "Set Grid",
        description: "Replace entire grid state (must match schema)",
        inputSchema: {
          grid: z.object({
            columns: z
              .array(
                z.object({
                  id: z.string(),
                  title: z.string(),
                  type: z.enum(["text", "number", "boolean", "markdown", "uri", "date"]),
                  width: z.number().optional(),
                }),
              )
              .min(0),
            rows: z.array(
              z.object({ id: z.string(), values: z.record(z.any()) }),
            ),
          }),
        },
      },
      async ({ grid: next }) => {
        setGrid(next as GridState);
        return jsonContent({ success: true });
      },
    );

    server.registerTool(
      "add_row",
      {
        title: "Add Row",
        description: "Append a new row with optional values",
        inputSchema: {
          values: z.record(z.any()).optional(),
        },
      },
      async ({ values }) => {
        const id = genId("row");
        const base = makeEmptyRow(grid.columns, id);
        const merged: Row = {
          ...base,
          values: { ...base.values },
        };
        if (values && typeof values === "object") {
          for (const col of grid.columns) {
            if (col.id in (values as any)) {
              merged.values[col.id] = coerceValue((values as any)[col.id], col.type);
            }
          }
        }
        setGrid({ ...grid, rows: [...grid.rows, merged] });
        return jsonContent({ success: true, rowId: id });
      },
    );

    server.registerTool(
      "update_cell",
      {
        title: "Update Cell",
        description: "Update a single cell value",
        inputSchema: {
          rowId: z.string().describe("Row id").optional(),
          rowIndex: z.number().int().min(0).optional(),
          columnId: z.string(),
          value: z.any(),
        },
      },
      async ({ rowId, rowIndex, columnId, value }) => {
        let idx = -1;
        if (typeof rowIndex === "number") idx = rowIndex;
        else if (typeof rowId === "string") idx = grid.rows.findIndex((r) => r.id === rowId);
        if (idx < 0 || idx >= grid.rows.length)
          return jsonContent({ success: false, reason: "Row not found" });
        const col = grid.columns.find((c) => c.id === columnId);
        if (!col) return jsonContent({ success: false, reason: "Column not found" });
        const coerced = coerceValue(value, col.type);
        const rows = grid.rows.map((r, i) =>
          i === idx ? { ...r, values: { ...r.values, [columnId]: coerced } } : r,
        );
        setGrid({ ...grid, rows });
        return jsonContent({ success: true });
      },
    );

    server.registerTool(
      "add_column",
      {
        title: "Add Column",
        description: "Add a new column and optionally set default values",
        inputSchema: {
          id: z.string().optional(),
          title: z.string().default("New Column"),
          type: z.enum(["text", "number", "boolean", "markdown", "uri", "date"]).default("text"),
          defaultValue: z.any().optional(),
        },
      },
      async ({ id, title, type, defaultValue }) => {
        const colId = id ?? genId("col");
        const col: Column = { id: colId, title, type: type as ColumnType, width: 160 };
        const columns = [...grid.columns, col];
        const rows = grid.rows.map((r) => ({
          ...r,
          values: {
            ...r.values,
            [colId]: defaultValue !== undefined ? coerceValue(defaultValue, col.type) : undefined,
          },
        }));
        setGrid({ columns, rows });
        return jsonContent({ success: true, columnId: colId });
      },
    );

    server.registerTool(
      "update_column",
      {
        title: "Update Column",
        description: "Update column metadata and optionally migrate type",
        inputSchema: {
          columnId: z.string(),
          title: z.string().optional(),
          type: z.enum(["text", "number", "boolean", "markdown", "uri", "date"]).optional(),
          width: z.number().optional(),
        },
      },
      async ({ columnId, title, type, width }) => {
        let next = grid;
        if (type) {
          next = migrateColumnType(next, columnId, type as ColumnType);
        }
        const columns = next.columns.map((c) =>
          c.id === columnId ? { ...c, title: title ?? c.title, width: width ?? c.width } : c,
        );
        setGrid({ ...next, columns });
        return jsonContent({ success: true });
      },
    );

    server.registerTool(
      "remove_column",
      {
        title: "Remove Column",
        description: "Delete a column by id",
        inputSchema: { columnId: z.string() },
      },
      async ({ columnId }) => {
        const columns = grid.columns.filter((c) => c.id !== columnId);
        const rows = grid.rows.map((r) => {
          const { [columnId]: _, ...rest } = r.values;
          return { ...r, values: rest };
        });
        setGrid({ columns, rows });
        return jsonContent({ success: true });
      },
    );

    server.registerTool(
      "remove_rows",
      {
        title: "Remove Rows",
        description: "Remove rows by ids or indices",
        inputSchema: {
          rowIds: z.array(z.string()).optional(),
          indices: z.array(z.number().int().min(0)).optional(),
        },
      },
      async ({ rowIds, indices }) => {
        let toDelete = new Set<number>();
        if (Array.isArray(indices)) for (const i of indices) toDelete.add(i);
        if (Array.isArray(rowIds)) {
          for (const id of rowIds) {
            const i = grid.rows.findIndex((r) => r.id === id);
            if (i >= 0) toDelete.add(i);
          }
        }
        if (toDelete.size === 0) return jsonContent({ success: false, reason: "No rows matched" });
        const rows = grid.rows.filter((_, i) => !toDelete.has(i));
        setGrid({ ...grid, rows });
        return jsonContent({ success: true, removed: [...toDelete] });
      },
    );

    server.registerTool(
      "reorder_columns",
      {
        title: "Reorder Columns",
        description: "Reorder columns either by full order array or by moving one id to a target index",
        inputSchema: {
          order: z.array(z.string()).optional(),
          sourceId: z.string().optional(),
          targetIndex: z.number().int().min(0).optional(),
        },
      },
      async ({ order, sourceId, targetIndex }) => {
        let columns = [...grid.columns];
        if (Array.isArray(order) && order.length === columns.length) {
          const byId = new Map(columns.map((c) => [c.id, c] as const));
          const next: Column[] = [];
          for (const id of order) {
            const c = byId.get(id);
            if (c) next.push(c);
          }
          if (next.length === columns.length) columns = next;
        } else if (sourceId && typeof targetIndex === "number") {
          const from = columns.findIndex((c) => c.id === sourceId);
          if (from >= 0) {
            const [m] = columns.splice(from, 1);
            columns.splice(Math.min(columns.length, Math.max(0, targetIndex)), 0, m);
          }
        }
        setGrid({ ...grid, columns });
        return jsonContent({ success: true, columns: columns.map((c) => c.id) });
      },
    );

    try {
      server.connect(transport);
    } catch (err) {
      console.error("MCP server error:", err);
    }

    return () => {
      server.close();
    };
  }, [grid, setGrid, nuwaClient]);
}
