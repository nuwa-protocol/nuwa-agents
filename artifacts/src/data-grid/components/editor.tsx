import "@glideapps/glide-data-grid/dist/index.css";

import {
  DataEditor,
  type EditableGridCell,
  type GridCell,
  GridCellKind,
  type GridColumn,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Column, ColumnType, GridState, Row } from "../types";
import { coerceValue, genId, makeEmptyRow, migrateColumnType } from "../types";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Type as TypeIcon,
  Hash,
  CheckSquare,
  Link as LinkIcon,
  FileText,
  Calendar,
} from "lucide-react";
// shadcn/ui primitives
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";

type EditorProps = {
  grid: GridState;
  onChange: (next: GridState) => void;
};

// Minimal inline popover for column actions
function ColumnMenu({
  column,
  anchor,
  onClose,
  onRename,
  onChangeType,
  onInsertLeft,
  onInsertRight,
  onDelete,
}: {
  column: Column;
  anchor: { x: number; y: number };
  onClose: () => void;
  onRename: (title: string) => void;
  onChangeType: (t: ColumnType) => void;
  onInsertLeft: () => void;
  onInsertRight: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(column.title);
  useEffect(() => setName(column.title), [column.title]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // clamp popover within viewport and enhance styling
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(anchor);
  useEffect(() => {
    const clamp = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pad = 8;
      const x = Math.min(anchor.x, window.innerWidth - rect.width - pad);
      const y = Math.min(anchor.y, window.innerHeight - rect.height - pad);
      setPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
    };
    const id = requestAnimationFrame(clamp);
    window.addEventListener("resize", clamp);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", clamp);
    };
  }, [anchor.x, anchor.y]);

  const TYPES: { t: ColumnType; label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; }[] = [
    { t: "text", label: "Text", Icon: TypeIcon },
    { t: "number", label: "Number", Icon: Hash },
    { t: "boolean", label: "Boolean", Icon: CheckSquare },
    { t: "uri", label: "Link", Icon: LinkIcon },
    { t: "markdown", label: "Markdown", Icon: FileText },
    { t: "date", label: "Date", Icon: Calendar },
  ];

  // Render anchored, card-like popover using shadcn styles/components
  return (
    <div
      ref={ref}
      className="absolute z-50 text-sm"
      style={{ top: pos.y, left: pos.x, minWidth: 320 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-popover text-popover-foreground rounded-md border shadow-md p-4 w-[320px]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon className="size-4 opacity-70" />
            <span className="truncate font-semibold">{column.title}</span>
          </div>
          <Badge variant="secondary" title="Column type">
            {TYPES.find((x) => x.t === column.type)?.label ?? column.type}
          </Badge>
        </div>
        <Separator className="my-2" />

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="col-name">Rename</Label>
            <div className="flex items-center gap-2">
              <Input
                id="col-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename(name.trim());
                    onClose();
                  }
                }}
                placeholder="Column name"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onRename(name.trim());
                  onClose();
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              defaultValue={column.type}
              onValueChange={(val) => {
                onChangeType(val as ColumnType);
                onClose();
              }}
            >
              <SelectTrigger className="w-full justify-between">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(({ t, label, Icon }) => (
                  <SelectItem key={t} value={t}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="size-4" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onInsertLeft}>
              <ChevronLeft className="size-4" />
              Insert Left
            </Button>
            <Button variant="outline" size="sm" onClick={onInsertRight}>
              Insert Right
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              <Trash2 className="size-4" />
              Delete Column
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Editor({ grid, onChange }: EditorProps) {
  // Local UI flags that do not affect saved state
  const [scrollToEnd, setScrollToEnd] = useState(false);
  const [menu, setMenu] = useState<{
    colIndex: number;
    anchor: { x: number; y: number };
  } | null>(null);

  // Build GridColumn[] from our columns
  const columns = useMemo<GridColumn[]>(() => {
    return grid.columns.map((c) => ({
      id: c.id,
      title: c.title,
      width: c.width ?? 160,
      hasMenu: true,
    }));
  }, [grid.columns]);

  // Translate grid location -> GridCell
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const colDef = grid.columns[col];
      const rowDef = grid.rows[row];
      const value = rowDef?.values?.[colDef?.id];
      switch (colDef?.type) {
        case "number":
          return {
            kind: GridCellKind.Number,
            data: typeof value === "number" ? value : undefined,
            displayData:
              typeof value === "number" && Number.isFinite(value)
                ? String(value)
                : "",
            allowOverlay: true,
          };
        case "boolean":
          return {
            kind: GridCellKind.Boolean,
            data: Boolean(value),
            // Boolean cells use in-place toggles; no overlay
            allowOverlay: false,
          };
        case "uri":
          return {
            kind: GridCellKind.Uri,
            data: value == null ? "" : String(value),
            displayData: value == null ? "" : String(value),
            allowOverlay: true,
            hoverEffect: true,
          };
        case "markdown":
          return {
            kind: GridCellKind.Markdown,
            data: value == null ? "" : String(value),
            allowOverlay: true,
          };
        case "date": {
          const s = value == null ? "" : String(value);
          return {
            kind: GridCellKind.Text,
            data: s,
            displayData: s,
            allowOverlay: true,
          };
        }
        case "text":
        default:
          return {
            kind: GridCellKind.Text,
            data: value == null ? "" : String(value),
            displayData: value == null ? "" : String(value),
            allowOverlay: true,
          };
      }
    },
    [grid.columns, grid.rows],
  );

  // Persist a single cell edit
  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [col, row] = cell;
      const colDef = grid.columns[col];
      const rowDef = grid.rows[row];
      if (!colDef || !rowDef) return;

      // Normalize inbound edit to a primitive and then coerce to column's type
      let raw: any = undefined;
      switch (newValue.kind) {
        case GridCellKind.Boolean:
          raw = Boolean(newValue.data);
          break;
        case GridCellKind.Number:
          raw = newValue.data;
          break;
        case GridCellKind.Text:
          raw = newValue.data;
          break;
        case GridCellKind.Uri:
          raw = newValue.data;
          break;
        case GridCellKind.Markdown:
          raw = newValue.data;
          break;
        default:
          break;
      }
      const nextVal = coerceValue(raw, colDef.type);

      const rows: Row[] = grid.rows.map((r, rIdx) =>
        rIdx === row ? { ...r, values: { ...r.values, [colDef.id]: nextVal } } : r,
      );
      onChange({ ...grid, rows });
    },
    [grid, onChange],
  );

  // Append a new, empty row when user clicks trailing row
  const onRowAppended = useCallback(() => {
    const nextRows = [...grid.rows, makeEmptyRow(grid.columns)];
    onChange({ ...grid, rows: nextRows });
  }, [grid, onChange]);

  const onColumnResize = useCallback(
    (
      column: GridColumn,
      newSize: number,
      colIndex: number,
      _newSizeWithGrow: number,
    ) => {
      const nextCols = grid.columns.map((c, i) =>
        i === colIndex ? { ...c, width: Math.max(60, Math.min(newSize, 600)) } : c,
      );
      onChange({ ...grid, columns: nextCols });
    },
    [grid, onChange],
  );

  const onColumnMoved = useCallback(
    (startIndex: number, endIndex: number) => {
      if (startIndex === endIndex) return;
      const next = [...grid.columns];
      const [moved] = next.splice(startIndex, 1);
      next.splice(endIndex, 0, moved);
      onChange({ ...grid, columns: next });
    },
    [grid, onChange],
  );

  const onDeleteRows = useCallback(
    (rows: readonly number[]) => {
      if (rows.length === 0) return;
      const toDelete = new Set(rows);
      const nextRows = grid.rows.filter((_, idx) => !toDelete.has(idx));
      onChange({ ...grid, rows: nextRows });
    },
    [grid, onChange],
  );

  const onDelete = useCallback(
    (selection: { rows: readonly number[] } & any) => {
      if (selection?.rows && selection.rows.length > 0) {
        onDeleteRows(selection.rows);
        return true;
      }
      return false;
    },
    [onDeleteRows],
  );

  const onHeaderMenuClick = useCallback(
    (colIndex: number, screenPosition: Rectangle) => {
      setMenu({ colIndex, anchor: { x: screenPosition.x, y: screenPosition.y } });
    },
    [],
  );

  // Toolbar actions
  const addColumn = useCallback(() => {
    const id = genId("col");
    const col: Column = { id, title: "New Column", type: "text", width: 160 };
    const cols = [...grid.columns, col];
    // ensure new column has an entry in each row
    const rows = grid.rows.map((r) => ({ ...r, values: { ...r.values, [id]: undefined } }));
    onChange({ columns: cols, rows });
    // Scroll to end for visibility
    setScrollToEnd(true);
  }, [grid, onChange]);

  const addRow = useCallback(() => {
    const rows = [...grid.rows, makeEmptyRow(grid.columns)];
    onChange({ ...grid, rows });
  }, [grid, onChange]);

  // Reset scrollToEnd next frame to avoid persistent autoscroll
  useEffect(() => {
    if (!scrollToEnd) return;
    const id = requestAnimationFrame(() => setScrollToEnd(false));
    return () => cancelAnimationFrame(id);
  }, [scrollToEnd]);

  // Column menu handlers
  const activeCol = menu ? grid.columns[menu.colIndex] : undefined;

  const handleRename = useCallback(
    (title: string) => {
      const cols = grid.columns.map((c, i) => (i === menu?.colIndex ? { ...c, title } : c));
      onChange({ ...grid, columns: cols });
    },
    [grid, onChange, menu?.colIndex],
  );

  const handleChangeType = useCallback(
    (t: ColumnType) => {
      const col = grid.columns[menu!.colIndex];
      const next = migrateColumnType(grid, col.id, t);
      onChange(next);
    },
    [grid, onChange, menu],
  );

  const handleDeleteColumn = useCallback(() => {
    if (!menu) return;
    const col = grid.columns[menu.colIndex];
    const cols = grid.columns.filter((_, i) => i !== menu.colIndex);
    const rows = grid.rows.map((r) => {
      const { [col.id]: _, ...rest } = r.values;
      return { ...r, values: rest };
    });
    onChange({ columns: cols, rows });
  }, [grid, menu, onChange]);

  const handleInsert = useCallback(
    (side: "left" | "right") => {
      if (!menu) return;
      const colIndex = menu.colIndex + (side === "right" ? 1 : 0);
      const id = genId("col");
      const col: Column = { id, title: side === "left" ? "New Left" : "New Right", type: "text", width: 160 };
      const cols = [...grid.columns];
      cols.splice(colIndex, 0, col);
      const rows = grid.rows.map((r) => ({ ...r, values: { ...r.values, [id]: undefined } }));
      onChange({ columns: cols, rows });
      setMenu(null);
    },
    [grid, menu, onChange],
  );

  return (
    <div className="absolute inset-0 flex flex-col text-[color:var(--foreground)] bg-[color:var(--background)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--border)]/80 bg-[color:var(--card)]/80 backdrop-blur z-10">
        <button className="inline-flex items-center gap-1 px-3 py-1 rounded-md border hover:bg-[color:var(--muted)]" onClick={addColumn}>
          <Plus size={16} />
          Add Column
        </button>
        <button className="inline-flex items-center gap-1 px-3 py-1 rounded-md border hover:bg-[color:var(--muted)]" onClick={addRow}>
          Add Row
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <DataEditor
          columns={columns}
          getCellContent={getCellContent}
          rows={grid.rows.length}
          onCellEdited={onCellEdited}
          onRowAppended={onRowAppended}
          trailingRowOptions={{ hint: "Add row" }}
          onColumnResize={onColumnResize}
          onColumnMoved={onColumnMoved}
          onDelete={onDelete}
          onHeaderMenuClick={onHeaderMenuClick}
          rowMarkers="number"
          smoothScrollX
          smoothScrollY
        />
      </div>
      {menu && activeCol ? (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)}>
          <ColumnMenu
            column={activeCol}
            anchor={menu.anchor}
            onClose={() => setMenu(null)}
            onRename={handleRename}
            onChangeType={handleChangeType}
            onInsertLeft={() => handleInsert("left")}
            onInsertRight={() => handleInsert("right")}
            onDelete={handleDeleteColumn}
          />
        </div>
      ) : null}
    </div>
  );
}
