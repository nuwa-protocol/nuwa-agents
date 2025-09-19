import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PostMessageMCPTransport } from "@nuwa-ai/ui-kit";
import { useEffect } from "react";
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

// Shared shape schema compatible with convertToExcalidrawElements
// Each field includes a description so the AI knows exactly what to provide.
const ShapeSchema = z
	.object({
		type: z
			.enum(["rectangle", "ellipse", "diamond", "arrow", "line", "text"]) // Excalidraw primitive type
			.describe(
				"Element type to create: rectangle | ellipse | diamond | arrow | line | text",
			),
		x: z
			.number()
			.describe(
				"X position of the element's top-left corner in canvas pixels (scene coordinates)",
			),
		y: z
			.number()
			.describe(
				"Y position of the element's top-left corner in canvas pixels (scene coordinates)",
			),
		width: z
			.number()
			.optional()
			.describe(
				"Element width in pixels (optional; Excalidraw may infer defaults for some types)",
			),
		height: z
			.number()
			.optional()
			.describe(
				"Element height in pixels (optional; Excalidraw may infer defaults for some types)",
			),
		angle: z
			.number()
			.optional()
			.describe("Rotation angle in radians, clockwise. 0 means unrotated."),
		text: z
			.string()
			.optional()
			.describe(
				"Text content for text elements; ignored for non-text types unless supported",
			),
		strokeColor: z
			.string()
			.optional()
			.describe(
				"Stroke (outline) color as a CSS color string, e.g., '#000000' or 'red'",
			),
		backgroundColor: z
			.string()
			.optional()
			.describe(
				"Fill color as a CSS color string for closed shapes (rectangle, ellipse, diamond)",
			),
		strokeStyle: z
			.enum(["solid", "dashed", "dotted"]) // Outline style
			.optional()
			.describe("Stroke line style: solid | dashed | dotted"),
		fillStyle: z
			.enum(["solid", "hachure", "zigzag", "cross-hatch"]) // Fill pattern
			.optional()
			.describe(
				"Fill pattern style for closed shapes: solid | hachure | zigzag | cross-hatch",
			),
		strokeWidth: z
			.number()
			.optional()
			.describe("Stroke width in pixels (outline thickness)"),
	})
	.describe("Serializable element shape definition understood by Excalidraw");

// For updates, allow a narrowed set of props we merge onto existing element
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
			})
			.strict()
			.describe("Patch of properties to merge onto the existing element"),
	})
	.describe(
		"Element update descriptor: which id to update and what props to change",
	);

export function useExcalidrawMCP(api: ExcalidrawImperativeAPI | null) {
	useEffect(() => {
		if (!api) return;

		const transport = new PostMessageMCPTransport();

		const server = new McpServer({ name: "excalidraw-mcp", version: "1.0.0" });

		// Read tools
		server.registerTool(
			"get_elements",
			{
				title: "Get Elements",
				description: "Return current elements in the canvas",
				inputSchema: {},
			},
			async () => {
				try {
					const elements = api.getSceneElements();
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
				description: "Replace the entire scene. Omit 'elements' or pass an empty array to clear the canvas.",
				inputSchema: {
					elements: z
						.array(ShapeSchema)
						.optional()
						.describe(
							"Array of new elements to set as the scene. If omitted or [], the scene is cleared.",
						),
				},
			},
			async (input) => {
				const InputSchema = z
					.object({
						elements: z.array(ShapeSchema).optional(),
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
					const created = convertToExcalidrawElements(elements as any);
					api.updateScene({ elements: created });
					return jsonContent({
						success: true,
						createdIds: created.map((e: any) => e.id),
					});
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
				description: "Add one or more elements to the current scene",
				inputSchema: {
					elements: z
						.array(ShapeSchema)
						.describe("Array of elements to append to the current scene"),
				},
			},
			async (input) => {
				const InputSchema = z
					.object({ elements: z.array(ShapeSchema) })
					.strict();
				const parsed = InputSchema.safeParse(input);
				if (!parsed.success) {
					return errorResponse("Invalid input for add_elements", {
						issues: zodIssues(parsed.error),
					});
				}
				try {
					const current = api.getSceneElements();
					const created = convertToExcalidrawElements(
						parsed.data.elements as any,
					);
					api.updateScene({ elements: [...current, ...created] as any });
					return jsonContent({
						success: true,
						created: created.map((e: any) => e.id),
					});
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
					const current = api.getSceneElements();
					const existingIds = new Set(current.map((e: any) => e.id));
					const notFound = list
						.filter((u) => !existingIds.has(u.id))
						.map((u) => u.id);
					if (notFound.length > 0) {
						return errorResponse("Some element ids were not found", {
							notFound,
						});
					}
					const byId = new Map<string, any>();
					for (const u of list) byId.set(u.id, u.props);
					const next = current.map((e: any) => {
						const patch = byId.get(e.id);
						if (!patch) return e;
						// Only shallow-merge allowed keys; Excalidraw will validate.
						return { ...e, ...patch };
					});
					api.updateScene({ elements: next as any });
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
					const current = api.getSceneElements();
					const ids = new Set(parsed.data.ids);
					const existingIds = new Set(current.map((e: any) => e.id));
					const notFound: string[] = [];
					for (const id of ids) if (!existingIds.has(id)) notFound.push(id);
					const next = current.filter((e: any) => !ids.has(e.id));
					api.updateScene({ elements: next as any });
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

		try {
			server.connect(transport);
		} catch (err) {
			console.error("MCP server error:", err);
		}

		return () => {
			server.close();
		};
	}, [api]);
}
