import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { useNuwaMCP } from "@nuwa-ai/ui-kit";
import { z } from "zod";

type ToolResponse = { content: { type: "text"; text: string }[] };

// Wrap any object as MCP tool response text
function jsonContent(obj: any): ToolResponse {
	return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

// Standardized error payload so the AI can understand failures
function errorResponse(message: string, details?: any): ToolResponse {
	return jsonContent({ success: false, error: { message, details } });
}

// Convert zod issues into a compact serializable structure
function zodIssues(e: z.ZodError) {
	return e.issues.map((i) => ({
		path: i.path.join("."),
		code: i.code,
		message: i.message,
	}));
}

// Lightweight text measurement to autosize containers to their labels
const _canvas =
	typeof document !== "undefined" && (document as any).createElement
		? (document as any).createElement("canvas")
		: (null as any);
const _ctx = _canvas
	? (_canvas.getContext("2d") as CanvasRenderingContext2D | null)
	: null;
function measureLabelSize(label: any): { w: number; h: number } {
	const text = String(label?.text ?? "");
	const fontSize = Math.max(10, Number(label?.fontSize ?? 18));
	const fontFamily = String(label?.fontFamily ?? "Virgil");
	const lines = text.split("\n");
	if (!_ctx) {
		const longest = lines.reduce((m, s) => Math.max(m, s.length), 1);
		const w = longest * fontSize * 0.6;
		const h = lines.length * fontSize * 1.4;
		return { w, h };
	}
	try {
		_ctx.font = `${fontSize}px ${fontFamily}`;
		const w = Math.max(...lines.map((s) => _ctx!.measureText(s).width), 1);
		const h = lines.length * fontSize * 1.4;
		return { w, h };
	} catch {
		const longest = lines.reduce((m, s) => Math.max(m, s.length), 1);
		const w = longest * fontSize * 0.6;
		const h = lines.length * fontSize * 1.4;
		return { w, h };
	}
}

// Shared enums
const StrokeStyleEnum = z.enum(["solid", "dashed", "dotted"]);
const FillStyleEnum = z.enum(["solid", "hachure", "zigzag", "cross-hatch"]);
const TextAlignEnum = z.enum(["left", "center", "right"]);
const VerticalAlignEnum = z.enum(["top", "middle", "bottom"]);
const ArrowheadEnum = z.enum([
	"arrow",
	"bar",
	"dot",
	"circle",
	"circle_outline",
	"triangle",
	"triangle_outline",
	"diamond",
	"diamond_outline",
	"crowfoot_one",
	"crowfoot_many",
	"crowfoot_one_or_many",
	// convenience input; mapped to null internally
	"none",
]);
const BindableTypeEnum = z.enum(["rectangle", "ellipse", "diamond"]);

// Common style properties used across shapes
const StylePropsSchema = z.object({
	strokeColor: z
		.string()
		.optional()
		.describe("Stroke (outline) CSS color, e.g. '#000' or 'red'"),
	backgroundColor: z
		.string()
		.optional()
		.describe("Fill CSS color for closed shapes"),
	strokeStyle: StrokeStyleEnum.optional().describe(
		"Stroke line style: solid | dashed | dotted",
	),
	fillStyle: FillStyleEnum.optional().describe(
		"Fill pattern: solid | hachure | zigzag | cross-hatch",
	),
	strokeWidth: z.number().optional().describe("Stroke width in pixels"),
	angle: z
		.number()
		.optional()
		.describe("Rotation angle in radians; clockwise; 0 = unrotated"),
	opacity: z.number().optional().describe("Opacity 0–100"),
	roughness: z.number().optional().describe("Roughness 0–4 (sketchiness)"),
});

const LabelSchema = z
	.object({
		text: z.string().describe("Label text to bind onto the element"),
		fontSize: z.number().optional(),
		fontFamily: z.string().optional(),
		textAlign: TextAlignEnum.optional(),
		verticalAlign: VerticalAlignEnum.optional(),
		x: z.number().optional().describe("Optional label X override"),
		y: z.number().optional().describe("Optional label Y override"),
		strokeColor: z.string().optional(),
	})
	.describe("Text label bound to a container/linear element");

// Linear bindings (arrow/line) — simplified union per docs
const LinearBindingSchema = z
	.object({
		id: z
			.string()
			.optional()
			.describe(
				"Id of an existing element to bind to (must be part of the same scene rebuild)",
			),
		type: z
			.enum(["text", ...BindableTypeEnum.options])
			.optional()
			.describe(
				"Type of element to create/bind; when creating, you may also supply x/y/width/height or text",
			),
		text: z.string().optional(),
		x: z.number().optional(),
		y: z.number().optional(),
		width: z.number().optional(),
		height: z.number().optional(),
	})
	.describe(
		"Linear endpoint binding. Prefer using connect_elements to bind to existing ids.",
	);

// Discriminated union for ExcalidrawElementSkeleton subset we support
const ShapeSchema = z
	.discriminatedUnion("type", [
		// Containers
		z.object({
			type: z.literal("rectangle"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			width: z.number().optional(),
			height: z.number().optional(),
			label: LabelSchema.optional(),
			...StylePropsSchema.shape,
		}),
		z.object({
			type: z.literal("ellipse"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			width: z.number().optional(),
			height: z.number().optional(),
			label: LabelSchema.optional(),
			...StylePropsSchema.shape,
		}),
		z.object({
			type: z.literal("diamond"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			width: z.number().optional(),
			height: z.number().optional(),
			label: LabelSchema.optional(),
			...StylePropsSchema.shape,
		}),
		// Linear
		z.object({
			type: z.literal("line"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			width: z.number().optional().describe("Delta X to end point"),
			height: z.number().optional().describe("Delta Y to end point"),
			label: LabelSchema.optional(),
			start: LinearBindingSchema.optional(),
			end: LinearBindingSchema.optional(),
			...StylePropsSchema.shape,
		}),
		z.object({
			type: z.literal("arrow"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			width: z.number().optional().describe("Delta X to end point"),
			height: z.number().optional().describe("Delta Y to end point"),
			label: LabelSchema.optional(),
			start: LinearBindingSchema.optional(),
			end: LinearBindingSchema.optional(),
			startArrowhead: ArrowheadEnum.optional(),
			endArrowhead: ArrowheadEnum.optional(),
			...StylePropsSchema.shape,
		}),
		// Text
		z.object({
			type: z.literal("text"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			text: z.string(),
			fontSize: z.number().optional(),
			fontFamily: z.string().optional(),
			textAlign: TextAlignEnum.optional(),
			verticalAlign: VerticalAlignEnum.optional(),
			containerId: z.string().optional(),
			...StylePropsSchema.shape,
		}),
		// Image
		z.object({
			type: z.literal("image"),
			id: z.string().optional(),
			x: z.number(),
			y: z.number(),
			fileId: z.string().describe("Excalidraw FileId for the image"),
			width: z.number().optional(),
			height: z.number().optional(),
			...StylePropsSchema.shape,
		}),
		// Frame
		z.object({
			type: z.literal("frame"),
			id: z.string().optional(),
			children: z
				.array(z.string())
				.describe("Ids of elements inside the frame"),
			name: z.string().optional(),
			x: z.number().optional(),
			y: z.number().optional(),
			width: z.number().optional(),
			height: z.number().optional(),
			...StylePropsSchema.shape,
		}),
		// Magic Frame
		z.object({
			type: z.literal("magicframe"),
			id: z.string().optional(),
			children: z
				.array(z.string())
				.describe("Ids of elements inside the magic frame"),
			name: z.string().optional(),
			x: z.number().optional(),
			y: z.number().optional(),
			width: z.number().optional(),
			height: z.number().optional(),
			...StylePropsSchema.shape,
		}),
	])
	.describe(
		"Excalidraw element skeleton (subset) compatible with convertToExcalidrawElements.",
	);

// For updates, allow a set of safe props we merge onto existing element
const ElementUpdateSchema = z
	.object({
		id: z.string().describe("Id of the existing element to update"),
		props: z
			.object({
				x: z
					.number()
					.optional()
					.describe(
						"New X position (pixels) for the element's top-left corner",
					),
				y: z
					.number()
					.optional()
					.describe(
						"New Y position (pixels) for the element's top-left corner",
					),
				width: z.number().optional().describe("New width in pixels"),
				height: z.number().optional().describe("New height in pixels"),
				angle: z
					.number()
					.optional()
					.describe("New rotation angle in radians, clockwise"),
				text: z
					.string()
					.optional()
					.describe("New text content (only for text elements)"),
				strokeColor: z
					.string()
					.optional()
					.describe("New stroke color as a CSS color string"),
				backgroundColor: z
					.string()
					.optional()
					.describe("New fill color as a CSS color string"),
				strokeStyle: z
					.enum(["solid", "dashed", "dotted"]) // Outline style
					.optional()
					.describe("New stroke line style"),
				fillStyle: z
					.enum(["solid", "hachure", "zigzag", "cross-hatch"]) // Fill pattern
					.optional()
					.describe("New fill pattern style"),
				strokeWidth: z
					.number()
					.optional()
					.describe("New stroke width in pixels"),
				opacity: z.number().optional().describe("New opacity 0–100"),
				roughness: z.number().optional().describe("New roughness 0–4"),
				fontSize: z.number().optional().describe("New font size (text)"),
				fontFamily: z.string().optional().describe("New font family (text)"),
				textAlign: TextAlignEnum.optional().describe(
					"New horizontal text align",
				),
				verticalAlign: VerticalAlignEnum.optional().describe(
					"New vertical text align",
				),
				startArrowhead: ArrowheadEnum.optional().describe(
					"Arrowhead at start (arrow only)",
				),
				endArrowhead: ArrowheadEnum.optional().describe(
					"Arrowhead at end (arrow only)",
				),
			})
			.strict()
			.describe("Patch of properties to merge onto the existing element"),
	})
	.describe(
		"Element update descriptor: which id to update and what props to change",
	);

export function useExcalidrawMCP(
	api: ExcalidrawImperativeAPI | null,
	state?: {
		getSkeletons?: () => any[];
		setSkeletons?: (next: any[] | ((prev: any[]) => any[])) => void;
	},
) {
	const server = new McpServer({ name: "excalidraw-mcp", version: "1.0.0" });

	// Canonical skeleton helpers
	const getS = () => (state?.getSkeletons ? state.getSkeletons() : []);
	const setS = (next: any[] | ((prev: any[]) => any[])) => {
		if (state?.setSkeletons) state.setSkeletons(next);
	};
	// ExcalidrawArtifact owns applying skeletons to the canvas via useEffect

	// Read tools
	server.registerTool(
		"get_elements",
		{
			title: "Get Elements",
			description:
				"Return current elements in the canvas (use to discover ids for updates/removals)",
			inputSchema: {},
		},
		async () => {
			const apiNow = api;
			if (!apiNow) return errorResponse("Excalidraw API not ready");
			try {
				const elements = apiNow.getSceneElements();
				const summary = elements.map((e: any) => ({
					id: e.id,
					type: e.type,
					x: e.x,
					y: e.y,
					width: e.width,
					height: e.height,
					angle: e.angle,
					text: (e as any).text ?? undefined,
					strokeColor: e.strokeColor,
					backgroundColor: e.backgroundColor,
				}));
				return jsonContent(summary);
			} catch (err: any) {
				return errorResponse("Failed to get elements", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	// Write tools
	server.registerTool(
		"set_scene",
		{
			title: "Set Scene",
			description:
				"Replace the entire scene. Pass [] or omit 'elements' to clear. Coordinates use top-left origin (x→right, y→down).",
			inputSchema: {
				elements: z
					.array(ShapeSchema)
					.optional()
					.describe(
						"Array of new elements to set as the scene. If omitted or [], the scene is cleared.",
					),
				keepIds: z
					.boolean()
					.optional()
					.describe(
						"If true, preserve supplied ids instead of regenerating new ones",
					),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({
					elements: z.array(ShapeSchema).optional(),
					keepIds: z.boolean().optional(),
				})
				.strict();
			const parsed = InputSchema.safeParse(input ?? {});
			if (!parsed.success) {
				return errorResponse("Invalid input for set_scene", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				const elements = parsed.data.elements ?? [];
				// Enforce AI-supplied ids for determinism
				if (elements.length > 0) {
					const missing = (elements as any[])
						.map((e, i) => ({ hasId: !!(e as any)?.id, i }))
						.filter((x) => !x.hasId)
						.map((x) => x.i);
					if (missing.length > 0) {
						return errorResponse(
							"Each element must include a stable 'id' (string)",
							{ missingIndices: missing },
						);
					}
				}
				setS(elements as any[]);
				return jsonContent({ success: true });
			} catch (err: any) {
				return errorResponse("Failed to set scene", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	// clear_scene removed: use set_scene with no 'elements' or elements: [] to clear

	server.registerTool(
		"add_elements",
		{
			title: "Add Elements",
			description:
				"Append one or more elements to the current scene. For line/arrow, end = (x+width, y+height).",
			inputSchema: {
				elements: z
					.array(ShapeSchema)
					.describe("Array of elements to append to the current scene"),
				keepIds: z
					.boolean()
					.optional()
					.describe("If true, preserve supplied ids instead of regenerating"),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({
					elements: z.array(ShapeSchema),
					keepIds: z.boolean().optional(),
				})
				.strict();
			const parsed = InputSchema.safeParse(input);
			if (!parsed.success) {
				return errorResponse("Invalid input for add_elements", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				// Enforce AI-supplied ids for determinism
				const missing = (parsed.data.elements as any[])
					.map((e, i) => ({ hasId: !!(e as any)?.id, i }))
					.filter((x) => !x.hasId)
					.map((x) => x.i);
				if (missing.length > 0) {
					return errorResponse(
						"Each element must include a stable 'id' (string)",
						{ missingIndices: missing },
					);
				}

				// Autosize containers with labels to keep text readable
				const sized = (parsed.data.elements as any[]).map((e: any) => {
					if (
						(e.type === "rectangle" ||
							e.type === "ellipse" ||
							e.type === "diamond") &&
						e.label &&
						typeof e.label.text === "string"
					) {
						const { w, h } = measureLabelSize(e.label);
						const padding = 12;
						const minW = 120;
						const minH = 48;
						const next: any = { ...e };
						next.width = Math.max(
							Number(e.width ?? 0),
							Math.ceil(w) + padding * 2,
							minW,
						);
						next.height = Math.max(
							Number(e.height ?? 0),
							Math.ceil(h) + padding * 2,
							minH,
						);
						next.label = {
							...e.label,
							textAlign: e.label.textAlign ?? "center",
							verticalAlign: e.label.verticalAlign ?? "middle",
						};
						return next;
					}
					return e;
				});

				setS((prev) => {
					const ids = new Set(sized.map((e: any) => e.id));
					const base = (prev || []).filter((e: any) => !ids.has(e.id));
					return [...base, ...sized];
				});
				return jsonContent({ success: true });
			} catch (err: any) {
				return errorResponse("Failed to add elements", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	server.registerTool(
		"update_elements",
		{
			title: "Update Elements",
			description:
				"Update element properties by id (position, size, style, text)",
			inputSchema: {
				updates: z
					.array(ElementUpdateSchema)
					.describe(
						"List of updates; each item specifies an element id and a patch of properties",
					),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({ updates: z.array(ElementUpdateSchema).min(1) })
				.strict();
			const parsed = InputSchema.safeParse(input);
			if (!parsed.success) {
				return errorResponse("Invalid input for update_elements", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				const list = parsed.data.updates;
				const existingIds = new Set((getS() || []).map((e: any) => e.id));
				const notFound = list
					.filter((u) => !existingIds.has(u.id))
					.map((u) => u.id);
				if (notFound.length > 0) {
					return errorResponse("Some element ids were not found", { notFound });
				}
				setS((prev) => {
					const byId = new Map<string, any>();
					for (const u of list) {
						const patch = { ...u.props } as any;
						if (patch.startArrowhead === "none")
							patch.startArrowhead = undefined;
						if (patch.endArrowhead === "none") patch.endArrowhead = undefined;
						byId.set(u.id, patch);
					}
					return (prev || []).map((e: any) => {
						const patch = byId.get(e.id);
						return patch ? { ...e, ...patch } : e;
					});
				});
				return jsonContent({ success: true, updated: list.length });
			} catch (err: any) {
				return errorResponse("Failed to update elements", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	server.registerTool(
		"remove_elements",
		{
			title: "Remove Elements",
			description: "Remove elements by ids",
			inputSchema: {
				ids: z
					.array(z.string())
					.min(1)
					.describe("Array of element ids to remove from the scene"),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({ ids: z.array(z.string()).min(1) })
				.strict();
			const parsed = InputSchema.safeParse(input);
			if (!parsed.success) {
				return errorResponse("Invalid input for remove_elements", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				const ids = new Set(parsed.data.ids);
				const current = getS();
				const existingIds = new Set(current.map((e: any) => e.id));
				const notFound: string[] = [];
				for (const id of ids) if (!existingIds.has(id)) notFound.push(id);
				setS((prev) => (prev || []).filter((e: any) => !ids.has(e.id)));
				return jsonContent({
					success: true,
					removed: parsed.data.ids.filter((id) => existingIds.has(id)),
					notFound,
				});
			} catch (err: any) {
				return errorResponse("Failed to remove elements", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	// Search elements helper
	server.registerTool(
		"search_elements",
		{
			title: "Search Elements",
			description:
				"Find element ids by type, by text substring, or within a bounding box.",
			inputSchema: {
				type: z
					.enum([
						"rectangle",
						"ellipse",
						"diamond",
						"line",
						"arrow",
						"text",
						"image",
						"frame",
						"magicframe",
					])
					.optional(),
				textIncludes: z
					.string()
					.optional()
					.describe("Substring to match in text content (case-insensitive)"),
				within: z
					.object({
						x: z.number(),
						y: z.number(),
						width: z.number(),
						height: z.number(),
					})
					.optional()
					.describe(
						"Bounding box filter: element's bounding box must intersect this rect",
					),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({
					type: z
						.enum([
							"rectangle",
							"ellipse",
							"diamond",
							"line",
							"arrow",
							"text",
							"image",
							"frame",
							"magicframe",
						])
						.optional(),
					textIncludes: z.string().optional(),
					within: z
						.object({
							x: z.number(),
							y: z.number(),
							width: z.number(),
							height: z.number(),
						})
						.optional(),
				})
				.strict();
			const parsed = InputSchema.safeParse(input ?? {});
			if (!parsed.success) {
				return errorResponse("Invalid input for search_elements", {
					issues: zodIssues(parsed.error),
				});
			}
			const apiNow = api;
			if (!apiNow) return errorResponse("Excalidraw API not ready");
			try {
				const { type, textIncludes, within } = parsed.data;
				const q = textIncludes?.toLowerCase();
				const elements = apiNow.getSceneElements();
				const hits = elements.filter((e: any) => {
					if (type && e.type !== type) return false;
					if (q) {
						const t = (e as any).text?.toLowerCase?.() || "";
						if (!t.includes(q)) return false;
					}
					if (within) {
						const ex1 = e.x;
						const ey1 = e.y;
						const ex2 = e.x + e.width;
						const ey2 = e.y + e.height;
						const wx1 = within.x;
						const wy1 = within.y;
						const wx2 = within.x + within.width;
						const wy2 = within.y + within.height;
						const intersects = !(
							ex2 < wx1 ||
							ex1 > wx2 ||
							ey2 < wy1 ||
							ey1 > wy2
						);
						if (!intersects) return false;
					}
					return true;
				});
				const out = hits.map((e: any) => ({
					id: e.id,
					type: e.type,
					x: e.x,
					y: e.y,
					width: e.width,
					height: e.height,
					text: (e as any).text ?? undefined,
				}));
				return jsonContent(out);
			} catch (err: any) {
				return errorResponse("Failed to search elements", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	// Connect two elements by id using a bound arrow.
	// Implementation detail: we rebuild the scene via convertToExcalidrawElements with keepIds=true
	// so the arrow can bind to existing shapes, per ElementSkeleton docs.
server.registerTool(
    "connect_elements",
    {
        title: "Connect Elements",
        description:
            "Create arrow(s) bound between element ids. Provide an array 'connections'.",
        inputSchema: {
            connections: z
                .array(
                    z
                        .object({
                            fromId: z.string(),
                            toId: z.string(),
                            label: LabelSchema.optional(),
                            style: StylePropsSchema.extend({
                                startArrowhead: ArrowheadEnum.optional(),
                                endArrowhead: ArrowheadEnum.optional(),
                                strokeWidth: z.number().optional(),
                            }).optional(),
                        })
                        .strict(),
                )
                .min(1)
                .describe("Array of connections to create"),
        },
    },
		async (input) => {
			const SingleConnectionSchema = z
				.object({
					fromId: z.string(),
					toId: z.string(),
					label: LabelSchema.optional(),
					style: StylePropsSchema.extend({
						startArrowhead: ArrowheadEnum.optional(),
						endArrowhead: ArrowheadEnum.optional(),
						strokeWidth: z.number().optional(),
					}).optional(),
				})
				.strict();
        const InputSchema = z
            .object({ connections: z.array(SingleConnectionSchema).min(1) })
            .strict();
        const parsed = InputSchema.safeParse(input ?? {});
			if (!parsed.success) {
				return errorResponse("Invalid input for connect_elements", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				const current = getS();
				const ids = new Set(current.map((e: any) => e.id));
            const pairs = (parsed.data as any).connections;

				const created: string[] = [];
				const failed: Array<{ fromId: string; toId: string; reason: string }> =
					[];

				const arrows: any[] = [];
				for (const p of pairs) {
					const { fromId, toId } = p;
					if (!ids.has(fromId) || !ids.has(toId)) {
						failed.push({
							fromId,
							toId,
							reason: !ids.has(fromId) ? "fromId not found" : "toId not found",
						});
						continue;
					}
					const fromEl: any = current.find((e: any) => e.id === fromId);
					const toEl: any = current.find((e: any) => e.id === toId);
					const cFrom = centerPoint(fromEl);
					const cTo = centerPoint(toEl);
					const start = edgePoint(fromEl, cTo);
					const end = edgePoint(toEl, cFrom);

					const arrow: any = {
						type: "arrow",
						x: start.x,
						y: start.y,
						width: end.x - start.x,
						height: end.y - start.y,
						start: { id: fromId },
						end: { id: toId },
						endArrowhead: "arrow",
					};
					if (p.label) arrow.label = p.label;
					if (p.style) {
						const s: any = { ...p.style };
						if (s.startArrowhead === "none") s.startArrowhead = undefined;
						if (s.endArrowhead === "none") s.endArrowhead = undefined;
						Object.assign(arrow, s);
					}
					arrows.push(arrow);
				}

				if (arrows.length === 0) {
					return jsonContent({ success: true, created, failed });
				}
				setS((prev) => [...(prev || []), ...arrows]);
				return jsonContent({ success: true, created, failed });
			} catch (err: any) {
				return errorResponse("Failed to connect elements", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	// Attach or update a label on an existing container/arrow by rebuilding the scene.
	// Simple grid layout tool to space a set of elements in row-major order
	server.registerTool(
		"layout_grid",
		{
			title: "Layout Grid",
			description:
				"Lay out the given element ids on a simple grid starting at origin (row-major).",
			inputSchema: {
				ids: z
					.array(z.string())
					.min(1)
					.describe("Ids to layout in row-major order"),
				origin: z
					.object({ x: z.number(), y: z.number() })
					.describe("Top-left starting point for the grid"),
				cols: z.number().min(1).describe("Number of columns in the grid"),
				gapX: z
					.number()
					.optional()
					.describe("Horizontal gap between columns (default 200)"),
				gapY: z
					.number()
					.optional()
					.describe("Vertical gap between rows (default 120)"),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({
					ids: z.array(z.string()).min(1),
					origin: z.object({ x: z.number(), y: z.number() }),
					cols: z.number().min(1),
					gapX: z.number().optional(),
					gapY: z.number().optional(),
				})
				.strict();
			const parsed = InputSchema.safeParse(input ?? {});
			if (!parsed.success) {
				return errorResponse("Invalid input for layout_grid", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				const ids = parsed.data.ids;
				const origin = parsed.data.origin;
				const cols = parsed.data.cols;
				const gapX = Number.isFinite(parsed.data.gapX as any)
					? (parsed.data.gapX as number)
					: 200;
				const gapY = Number.isFinite(parsed.data.gapY as any)
					? (parsed.data.gapY as number)
					: 120;

				const current = getS();
				const existing = new Set((current || []).map((e: any) => e.id));
				const notFound = ids.filter((id) => !existing.has(id));
				if (notFound.length === ids.length) {
					return errorResponse("None of the ids were found", { ids });
				}
				const targetIds = ids.filter((id) => existing.has(id));
				const posById = new Map<string, { x: number; y: number }>();
				targetIds.forEach((id, i) => {
					const row = Math.floor(i / cols);
					const col = i % cols;
					posById.set(id, {
						x: origin.x + col * gapX,
						y: origin.y + row * gapY,
					});
				});

				setS((prev) =>
					(prev || []).map((e: any) =>
						posById.has(e.id)
							? { ...e, x: posById.get(e.id)!.x, y: posById.get(e.id)!.y }
							: e,
					),
				);

				return jsonContent({ success: true, laidOut: targetIds, notFound });
			} catch (err: any) {
				return errorResponse("Failed to layout grid", {
					message: String(err?.message ?? err),
				});
			}
		},
	);
	server.registerTool(
		"set_label",
		{
			title: "Set Label",
			description:
				"Attach or update a label on an existing rectangle/ellipse/diamond/arrow by id.",
			inputSchema: {
				id: z.string().describe("Id of the target element"),
				label: LabelSchema.describe("Label to attach/update"),
			},
		},
		async (input) => {
			const InputSchema = z
				.object({ id: z.string(), label: LabelSchema })
				.strict();
			const parsed = InputSchema.safeParse(input ?? {});
			if (!parsed.success) {
				return errorResponse("Invalid input for set_label", {
					issues: zodIssues(parsed.error),
				});
			}
			try {
				const current = getS();
				const target: any = current.find((e: any) => e.id === parsed.data.id);
				if (!target) {
					return errorResponse("Element id not found", { id: parsed.data.id });
				}
				if (
					!["rectangle", "ellipse", "diamond", "arrow"].includes(target.type)
				) {
					return errorResponse(
						"Label is only supported for rectangle/ellipse/diamond/arrow",
						{ type: target.type },
					);
				}
				setS((prev) =>
					(prev || []).map((e: any) =>
						e.id === parsed.data.id ? { ...e, label: parsed.data.label } : e,
					),
				);
				return jsonContent({ success: true });
			} catch (err: any) {
				return errorResponse("Failed to set label", {
					message: String(err?.message ?? err),
				});
			}
		},
	);

	useNuwaMCP(server);
}

// Geometry helpers: compute edge points for rectangle/ellipse/diamond
type XY = { x: number; y: number };
function centerPoint(el: any): XY {
	const w = el.width ?? 0;
	const h = el.height ?? 0;
	return { x: (el.x ?? 0) + w / 2, y: (el.y ?? 0) + h / 2 };
}
function unitVec(from: XY, to: XY): XY {
	const dx = to.x - from.x,
		dy = to.y - from.y;
	const L = Math.hypot(dx, dy) || 1;
	return { x: dx / L, y: dy / L };
}
function rectEdge(el: any, toward: XY): XY {
	const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
	const cy = (el.y ?? 0) + (el.height ?? 0) / 2;
	const rx = (el.width ?? 0) / 2;
	const ry = (el.height ?? 0) / 2;
	const d = unitVec({ x: cx, y: cy }, toward);
	const ux = d.x !== 0 ? rx / Math.abs(d.x) : Number.POSITIVE_INFINITY;
	const uy = d.y !== 0 ? ry / Math.abs(d.y) : Number.POSITIVE_INFINITY;
	const u = Math.min(ux, uy);
	return { x: cx + d.x * u, y: cy + d.y * u };
}
function ellipseEdge(el: any, toward: XY): XY {
	const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
	const cy = (el.y ?? 0) + (el.height ?? 0) / 2;
	const rx = Math.max(1e-6, (el.width ?? 0) / 2);
	const ry = Math.max(1e-6, (el.height ?? 0) / 2);
	const d = unitVec({ x: cx, y: cy }, toward);
	const t = 1 / Math.sqrt((d.x * d.x) / (rx * rx) + (d.y * d.y) / (ry * ry));
	return { x: cx + d.x * t, y: cy + d.y * t };
}
function cross(a: XY, b: XY): number {
	return a.x * b.y - a.y * b.x;
}
function sub(a: XY, b: XY): XY {
	return { x: a.x - b.x, y: a.y - b.y };
}
function raySegHit(origin: XY, dir: XY, a: XY, b: XY): XY | null {
	const r = sub(b, a);
	const denom = cross(dir, r);
	if (Math.abs(denom) < 1e-8) return null;
	const ap = sub(a, origin);
	const u = cross(ap, r) / denom;
	const t = cross(ap, dir) / denom;
	if (u < 0 || t < 0 || t > 1) return null;
	return { x: origin.x + dir.x * u, y: origin.y + dir.y * u };
}
function diamondEdge(el: any, toward: XY): XY {
	const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
	const cy = (el.y ?? 0) + (el.height ?? 0) / 2;
	const x = el.x ?? 0,
		y = el.y ?? 0,
		w = el.width ?? 0,
		h = el.height ?? 0;
	const top: XY = { x: cx, y: y },
		right: XY = { x: x + w, y: cy },
		bottom: XY = { x: cx, y: y + h },
		left: XY = { x: x, y: cy };
	const segs: [XY, XY][] = [
		[top, right],
		[right, bottom],
		[bottom, left],
		[left, top],
	];
	const origin = { x: cx, y: cy };
	const d = unitVec(origin, toward);
	let best: XY | null = null;
	let bestDist = Infinity;
	for (const [a, b] of segs) {
		const pt = raySegHit(origin, d, a, b);
		if (!pt) continue;
		const dist = Math.hypot(pt.x - origin.x, pt.y - origin.y);
		if (dist < bestDist) {
			bestDist = dist;
			best = pt;
		}
	}
	return best ?? origin;
}
function edgePoint(el: any, toward: XY): XY {
	switch (el.type) {
		case "ellipse":
			return ellipseEdge(el, toward);
		case "diamond":
			return diamondEdge(el, toward);
		default:
			return rectEdge(el, toward);
	}
}
