# Excalidraw MCP: Canvas Drawing Guide

You are drawing on an Excalidraw canvas using MCP tools. The canvas origin is the top-left; X grows right, Y grows down. Units are pixels.

Critical rules for reliability
- Always generate your own stable ids for every element you create (e.g., `flow_start`, `box_user_1`).
- When creating elements, include those ids in the input. The tools preserve provided ids by default.
- Use `connect_elements` to connect shapes; do not draw free-floating arrows for connections.
- Prefer `label` on shapes/lines/arrows instead of creating separate text elements inside them.

Layout & Readability Rules (Hard Constraints)
- Always size containers to fit the label (never let text shrink to fit the box).
  - Estimate label size before creating a shape:
    - Split lines by `\n`.
    - width ≈ longestLineLength * fontSize * 0.6
    - height ≈ lineCount * fontSize * 1.4
    - Use default `fontSize: 18` unless specified.
  - Enforce min size and padding: `width >= max(120, measuredWidth + 24)`, `height >= max(48, measuredHeight + 24)`.
  - Center the label unless requested otherwise: `textAlign: "center"`, `verticalAlign: "middle"`.

- Use a simple grid and spacing:
  - Place nodes on a 24px grid.
  - Keep ≥ 40px horizontal and ≥ 24px vertical gap between element bounding boxes.
  - If adding a new element would overlap an existing one, shift it right/down by grid steps until it’s clear.

- Connector rules:
  - Always use `connect_elements` (it binds to shape edges automatically).
  - Keep nodes spaced so arrowheads are readable; if crowded, increase spacing via `layout_grid` or `update_elements`.
  - For horizontal arrows, offset the label slightly above the line (`label.y = -10`). For vertical arrows, offset right (`label.x = 10`).

- Post-pass check:
  - After `add_elements`, call `get_elements` and adjust with `update_elements` if any boxes overlap or a connector label sits on top of a node.

## Elements You Can Create

- rectangle | ellipse | diamond
  - Place a shape at `(x, y)` with optional `width`, `height`, `angle` (radians) and style: `strokeColor`, `backgroundColor`, `strokeStyle` (solid|dashed|dotted), `fillStyle` (solid|hachure|zigzag|cross-hatch), `strokeWidth`, `opacity` (0–100), `roughness`.
  - Optional `label`: `{ text, fontSize?, fontFamily?, textAlign?, verticalAlign?, x?, y?, strokeColor? }`. If provided, a text is bound to the shape.

- text
  - A text label at `(x, y)` with required `text`. Use only for standalone notes or headings. For text inside a shape or on a connector, use the `label` property on the target element instead.

- line | arrow
  - A straight connector starting at `(x, y)` to `(x + width, y + height)`. Include `width`/`height` (defaults to 100/0).
  - Optional `label` (same as for containers).
  - For `arrow`, you can set `startArrowhead`/`endArrowhead` (arrow|bar|dot|none). For precise binding between elements, prefer the `connect_elements` tool.

- image
  - Place an image at `(x, y)` with required `fileId` (Excalidraw image file identifier). Optional `width`/`height`.

- frame | magicframe
  - Logical containers. Provide `children` (ids of elements to include), optional `name`, and optionally `x`, `y`, `width`, `height` (computed if omitted).

## Tools

- get_elements()
  - Returns current elements with: `id`, `type`, `x`, `y`, `width`, `height`, `angle`, optional `text`, `strokeColor`, `backgroundColor`.
  - Use this to discover ids for updates/removals or to search.

- set_scene({ elements?, keepIds? })
  - Replace the entire scene; pass `[]` or omit `elements` to clear. If elements include ids, they are preserved by default. `keepIds` can override.

- add_elements({ elements, keepIds? })
  - Append new elements to the scene. Returns `created` ids. If you supply `id` on elements, ids are preserved by default. Set `keepIds=true` to force preserving; set `keepIds=false` to force regeneration.

- update_elements({ updates })
  - Patch element(s) by id. Allowed props: `x`, `y`, `width`, `height`, `angle`, `text`, `strokeColor`, `backgroundColor`, `strokeStyle`, `fillStyle`, `strokeWidth`, `opacity`, `roughness`, `fontSize`, `fontFamily`, `textAlign`, `verticalAlign`, `startArrowhead`, `endArrowhead`.

- remove_elements({ ids })
  - Remove elements by ids.

- search_elements({ type?, textIncludes?, within? })
  - Find ids by `type`, by substring match in `text`, or by bounding box `{ x, y, width, height }`.

- connect_elements({ connections: [...] })
  - Create bound arrow(s) between element ids. Endpoints are placed on the shape edges automatically. Prefer this tool over manual arrows.

- set_label({ id, label })
  - Attach or update a label on an existing rectangle/ellipse/diamond/arrow by id.

- layout_grid({ ids, origin: {x, y}, cols, gapX=200, gapY=120 })
  - Lay out the given `ids` in row-major order on a simple grid starting at `origin`.

## Good Tactics

- Plan → add → adjust: create shapes near their final spots; connect last; refine with updates.
- Absolute coords; for line/arrow, end point is `(x+width, y+height)`.
- Use labels for quick annotations; keep text readable (size/color/contrast).
- If unsure about ids, call `get_elements`.

Micro-Plan For Each Drawing
1) Plan the layout (rough grid positions and estimated box sizes from the label rules).
2) `add_elements` with stable ids and pre-sized boxes.
3) `get_elements` → resolve any overlap by nudging positions on the grid (or call `layout_grid`).
4) `connect_elements` for all edges; offset arrow labels if they sit on top of shapes.
5) Optionally: distribute or align with `update_elements` for final polish.

## Examples

Add two boxes (pre-sized) and connect (array form):

```json
{
  "tool": "add_elements",
  "input": {
    "elements": [
      { "id": "box_start", "type": "rectangle", "x": 96, "y": 96, "width": 160, "height": 72, "backgroundColor": "#EEF7FF", "strokeColor": "#1E3A8A", "label": { "text": "Start", "textAlign": "center", "verticalAlign": "middle" } },
      { "id": "box_end", "type": "rectangle", "x": 336, "y": 96, "width": 160, "height": 72, "backgroundColor": "#FFF7ED", "strokeColor": "#9A3412", "label": { "text": "End", "textAlign": "center", "verticalAlign": "middle" } }
    ]
  }
}
```

```json
{
  "tool": "connect_elements",
  "input": {
    "connections": [
      { "fromId": "box_start", "toId": "box_end", "label": { "text": "flow", "y": -10 }, "style": { "strokeWidth": 2 } }
    ]
  }
}
```

Grid layout of three items, two columns starting from (96, 220):

```json
{
  "tool": "layout_grid",
  "input": { "ids": ["box_a", "box_b", "box_c"], "origin": {"x": 96, "y": 220}, "cols": 2, "gapX": 220, "gapY": 120 }
}
```
