# Data Grid Editor Plan

This plan describes how to implement a fully-editable data grid based on `@glideapps/glide-data-grid`, with MCP tools so AI can read and modify the grid. It mirrors the note editor’s Nuwa/MCP integration patterns already present in the repo.

## Repo Fit

- Route already exists: `src/App.tsx:12`
- Current page wrapper: `src/data-grid/DataGridPage.tsx:1`
- Existing grid skeleton (demo): `src/data-grid/components/editor.tsx:1`
- Nuwa/MCP reference implementation: `src/note-editor/NoteEditorPage.tsx:1`, `src/note-editor/hooks/use-note-mcp.ts:1`

## Architecture

- State model
  - Column: `{ id: string; title: string; type: "text"|"number"|"boolean"; width?: number }`
  - Row: `{ id: string; values: Record<string /* columnId */, any> }`
  - GridState: `{ columns: Column[]; rows: Row[] }`
- Components
  - `DataGridPage`: init/load/save via Nuwa; mounts MCP; renders `Editor`
  - `Editor`: controlled wrapper around `DataEditor`; owns header menu, add row/column, cell editing
  - `ColumnMenu`: popover for per-column config (rename, type, delete)
- MCP integration
  - Hook `useDataGridMCP`: registers tools for grid/column/cell CRUD; uses `PostMessageMCPTransport`
- Persistence
  - Load initial `GridState` from `nuwaClient.getState`
  - Save on change via `nuwaClient.saveState`

## UI Plan (Glide Data Grid)

- Columns
  - Map `GridState.columns` to `GridColumn[]` with `title`, `width`, `id`, `hasMenu: true`
  - Resize: handle `onColumnResize` / `onColumnResizeEnd` to persist `width`
  - Reorder: handle `onColumnMoved` to reorder `columns`
- Cells
  - `getCellContent`: map row value to `GridCellKind.Text|Number|Boolean`
  - Enable editing using DataEditor’s built-in editing hooks: implement `onCellEdited` (and optionally `onCellsEdited`) to persist changes; grid handles overlay editors for built-in cell kinds.
  - Optional `onPaste: true` and `coercePasteValue` for type-aware paste; optional `validateCell` for immediate validation feedback
- Rows
  - Enable trailing row: `trailingRowOptions` + `onRowAppended` to append empty row
  - Optional top “Add Row” button for discoverability
- Column customization
  - Show header menu via `onHeaderMenuClick(col, screenPosition)`
  - Actions: Rename, Change Type (text/number/boolean), Delete
  - Add Column button in a small top toolbar; set `scrollToEnd` after adding
- Deletions (optional)
  - Prefer `onDelete(selection)` to handle deleting selected ranges/rows/columns; `onDeleteRows(rows)` also exists for row-only deletions

## MCP Tools (AI-Friendly Surface)

- Server/transport (mirror note editor)
  - Create `McpServer` named `data-grid-mcp` and connect via `PostMessageMCPTransport`
- Read tools
  - `get_grid`: returns full `GridState` JSON
  - `get_columns`: returns `columns`
  - `get_rows`: returns `rows` as `{ id, values }[]`
  - `get_as_markdown_table` (optional): first N rows as Markdown table for quick AI reading
- Write tools
  - `set_grid`: replace entire grid (validates schema)
  - `add_row`: optional values; returns `rowId`
  - `update_cell`: `{ rowId|rowIndex, columnId, value }` with type coercion
  - `add_column`: `{ title, type, id? }` with optional initial values
  - `update_column`: `{ columnId, title?, type?, width? }` with migration/coercion
  - `remove_column`: by `columnId`
  - `remove_rows`: by `rowIds` or indices
  - `reorder_columns`: `{ order: string[] }` or `{ sourceId, targetIndex }`
- Import/Export (optional v1.1)
  - `import_csv`: replace grid by parsing CSV (header row as columns; infer types)
 - `export_csv`: return CSV string of current view
- All tools: zod-validated inputs; JSON-encoded return via `{ content: [{ type: "text", text: JSON.stringify(...) }] }`

## DataGridPage Wiring

- Nuwa client init and theme handling: mirror note editor
  - Load on connect: `src/note-editor/NoteEditorPage.tsx:22`
  - Save on change: `src/note-editor/NoteEditorPage.tsx:65`
- Provide Nuwa client via existing provider: `src/note-editor/contexts/NuwaClientContext.tsx:14`
- Start MCP for data grid (new hook) similarly to: `src/note-editor/hooks/use-note-mcp.ts:206`

## Implementation Steps

1. Types and utils
   - Add `src/data-grid/types.ts` with `Column`, `Row`, `GridState`
   - Add small helpers for id generation, type coercion
2. Controlled Editor
   - Refactor `src/data-grid/components/editor.tsx` into a controlled component
   - Implement `getCellContent`, `onCellEdited`, `onRowAppended`, `onColumnResize`, `onColumnMoved`, `onDeleteRows`
   - Add `ColumnMenu` anchored by `onHeaderMenuClick`
   - Add toolbar with “Add Column” and optional “Add Row” button
3. Page wiring
   - Expand `src/data-grid/DataGridPage.tsx` to init Nuwa, load state (fallback sample data), and save on changes (debounced)
   - Wrap with `NuwaClientProvider`
4. MCP Hook
   - Create `src/data-grid/hooks/use-grid-mcp.ts`
   - Register read/write tools above; use zod; connect server/transport; clean up on unmount
5. Persistence
   - Use `nuwaClient.getState`/`saveState` with a key like `dataGridState`
6. Polish & QA
   - Verify paste, resize, reorder, menu, trailing row
   - Confirm MCP tool round-trips in the Nuwa Studio MCP tester

## File/Code References

- Nuwa + MCP pattern to mirror
  - `src/note-editor/NoteEditorPage.tsx:16` (connect handler), `src/note-editor/NoteEditorPage.tsx:65` (save on change)
  - `src/note-editor/hooks/use-note-mcp.ts:23` (transport), `src/note-editor/hooks/use-note-mcp.ts:30` (server), `src/note-editor/hooks/use-note-mcp.ts:206` (connect/cleanup)
- Existing grid skeleton
  - `src/data-grid/components/editor.tsx:1`
  - `src/data-grid/DataGridPage.tsx:1`
- Glide Data Grid APIs
  - Column menu events: `node_modules/@glideapps/glide-data-grid/API.md:1130`
  - Cell editing: `node_modules/@glideapps/glide-data-grid/API.md:970`
  - Trailing row: `node_modules/@glideapps/glide-data-grid/API.md:1110`
  - Column definitions: `node_modules/@glideapps/glide-data-grid/API.md:230`

## Open Questions

- Column types: start with `text`, `number`, `boolean` for v1? - we should support all cell types
- Need dropdown/select type now or defer? - we should support all cell types
- Do we add an AI UI affordance (like note editor’s AI menu) or rely on MCP-only for v1? - we do not need AI menu, only MCP
- Persistence: single `dataGridState` per page vs. support multiple named grids? - just single grid state per page

## Editing & Selection: Extracts for Reference

External docs (for later reference):
- Editing: https://docs.grid.glideapps.com/api/dataeditor/editing
- Selection handling: https://docs.grid.glideapps.com/api/dataeditor/selection-handling
- Cells: https://docs.grid.glideapps.com/api/cells

Local API extracts (from `node_modules/@glideapps/glide-data-grid/API.md`) to guide implementation:

- Editing callbacks
  - `onCellEdited?: (cell: Item, newValue: EditableGridCell) => void;` `onCellsEdited?: (edits: { location: Item; value: EditableGridCell }[]) => boolean | void;` (970)
  - `onFinishedEditing?: (newValue: GridCell | undefined, movement: Item) => void;` (996–1006)
  - `onPaste?: ((target: Item, values: readonly (readonly string[])[]) => boolean) | boolean;` (1008)
  - `coercePasteValue?: (val: string, cell: GridCell) => GridCell | undefined;` (1021)
  - `validateCell?: (cell: Item, newValue: EditableGridCell) => boolean | EditableGridCell;` (1240)
  - Custom editors via `provideEditor?: ProvideEditorCallback<GridCell>` (560–600)

- Adding rows (trailing row)
  - `trailingRowOptions?: { hint?: string; addIcon?: string; targetColumn?: number | GridColumn; ... }` and `onRowAppended?: () => void;` (1038–1110)

- Selection handling
  - Controlled selection: `gridSelection?: GridSelection; onGridSelectionChange?: (s: GridSelection | undefined) => void;` (872–874)
  - Selection shapes: `rangeSelect?: 'none'|'cell'|'rect'|'multi-cell'|'multi-rect'; columnSelect?: 'none'|'single'|'multi'; rowSelect?: 'none'|'single'|'multi';` (905–907)
  - Blending: `rangeSelectionBlending?`, `columnSelectionBlending?`, `rowSelectionBlending?` (919–921)
  - Clear event: `onSelectionCleared?: () => void;` (895)
  - Row selection mode: `rowSelectionMode?: 'auto'|'multi'` (1224)
  - Copy support: `getCellsForSelection?: true | (selection: Rectangle) => CellArray | GetCellsThunk;` (620–638)

- Deleting selections
  - `onDelete?: (selection: GridSelection) => GridSelection | boolean;` (940–958)
  - `onDeleteRows?: (rows: readonly number[]) => void;` (986–996)

- Built-in cell kinds (for mapping types)
  - Uri, Text, Image, RowID, Number, Bubble, Boolean, Loading, Markdown, Drilldown, Protected, Custom (270–320)

### Columns & Headers

- Header interactions
  - `onHeaderMenuClick?: (col: number, screenPosition: Rectangle) => void;` node_modules/@glideapps/glide-data-grid/API.md:1171
  - `onHeaderClicked?: (colIndex: number, event: HeaderClickedEventArgs) => void;` node_modules/@glideapps/glide-data-grid/API.md:1151
  - `onHeaderContextMenu?: (colIndex: number, event: HeaderClickedEventArgs) => void;` node_modules/@glideapps/glide-data-grid/API.md:1161
  - Group headers: `onGroupHeaderClicked?`, `onGroupHeaderContextMenu?` node_modules/@glideapps/glide-data-grid/API.md:1131,1141
- Column movement & resize
  - `onColumnMoved?: (startIndex: number, endIndex: number) => void;` node_modules/@glideapps/glide-data-grid/API.md:1093
  - `onColumnResize?`, `onColumnResizeStart?`, `onColumnResizeEnd?` node_modules/@glideapps/glide-data-grid/API.md:1103,1113,1121
- Auto scroll to new columns
  - `scrollToEnd?: boolean;` node_modules/@glideapps/glide-data-grid/API.md:1241

### Ref Methods & Utilities

- Efficient rerendering
  - `updateCells([{ cell: [col,row] }, ...])` node_modules/@glideapps/glide-data-grid/API.md:390
- Positioning & scrolling
  - `getBounds(col?, row?): Rectangle | undefined` node_modules/@glideapps/glide-data-grid/API.md:402
  - `scrollTo(col, row, dir?, paddingX?, paddingY?)` node_modules/@glideapps/glide-data-grid/API.md:412
- Programmatic actions
  - `appendRow(col, openOverlay = true)` node_modules/@glideapps/glide-data-grid/API.md:431
  - `emit('copy'|'paste'|'delete'|'fill-right'|'fill-down')` node_modules/@glideapps/glide-data-grid/API.md:446

### Rows & Markers

- Row markers
  - `rowMarkers?: 'checkbox'|'number'|'both'|'none'` node_modules/@glideapps/glide-data-grid/API.md:589
- Reorder rows
  - `onRowMoved?: (startIndex: number, endIndex: number) => void;` node_modules/@glideapps/glide-data-grid/API.md:1206

### Paste & Copy

- Paste handling
  - `onPaste?: ((target: Item, values: readonly (readonly string[])[]) => boolean) | boolean;` node_modules/@glideapps/glide-data-grid/API.md:1008
  - `coercePasteValue?: (val: string, cell: GridCell) => GridCell | undefined;` node_modules/@glideapps/glide-data-grid/API.md:1021
  - Note: grid won’t add rows if pasted data exceeds capacity; handle manually if needed.
- Copy data source
  - `getCellsForSelection?: true | (selection: Rectangle) => CellArray | GetCellsThunk;` node_modules/@glideapps/glide-data-grid/API.md:620

### Trailing Row (Add Row)

- DataEditor-level options and callback
  - `trailingRowOptions?: { tint?, sticky?, hint?, addIcon?, targetColumn? }` node_modules/@glideapps/glide-data-grid/API.md:1110
  - `onRowAppended?: () => void;` node_modules/@glideapps/glide-data-grid/API.md:1110

### Built-in Cell Interfaces (for mapping)

- EditableGridCell union (accepted by onCellEdited)
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:199
  - `EditableGridCell = TextCell | ImageCell | BooleanCell | MarkdownCell | UriCell | NumberCell | CustomCell`
- GridCellKind enum (for getCellContent)
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:247
  - Kinds: `Uri, Text, Image, RowID, Number, Bubble, Boolean, Loading, Markdown, Drilldown, Protected, Custom`

- TextCell: data/display/flags
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:331
  - Fields: `data: string`, `displayData: string`, `readonly?`, `allowWrapping?`, `hoverEffect?`, `allowOverlay`
- NumberCell: formatting options
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:341
  - Fields: `data: number|undefined`, `displayData: string`, `fixedDecimals?`, `allowNegative?`, `thousandSeparator?`, `decimalSeparator?`, `readonly?`
- BooleanCell: tri-state
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:439
  - Fields: `data: boolean | null | undefined` (BooleanEmpty, BooleanIndeterminate), `readonly?`, `allowOverlay: false`, `maxSize?`
- UriCell: link behaviors
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:468
  - Fields: `data: string`, `displayData?`, `readonly?`, `onClickUri?`, `hoverEffect?`
- MarkdownCell: text markup
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:461
  - Fields: `data: string`, `readonly?`
- ImageCell: image arrays
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:353
  - Fields: `data: string[]`, `rounding?`, `displayData?`, `readonly?`
- BubbleCell: tag-like lists
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:362
  - Fields: `data: string[]`
- RowIDCell: primary key display
  - node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:454
  - Fields: `data: string`, `readonly?`
- DrilldownCell / Protected / Loading
  - Drilldown: node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:433
  - Protected: node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:326
  - Loading: node_modules/@glideapps/glide-data-grid/src/internal/data-grid/data-grid-types.ts:318

### Custom Cells

- Provide custom editors/renderers
  - `provideEditor?: ProvideEditorCallback<GridCell>` node_modules/@glideapps/glide-data-grid/API.md:560
  - Hook: `useCustomCells([...])` returns `{ drawCell, provideEditor }` node_modules/@glideapps/glide-data-grid/API.md:1280
