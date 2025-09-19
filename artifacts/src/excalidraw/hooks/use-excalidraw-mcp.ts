import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type NuwaClient, PostMessageMCPTransport } from "@nuwa-ai/ui-kit";
import { useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { z } from "zod";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

type ToolResponse = { content: { type: "text"; text: string }[] };
function jsonContent(obj: any): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

// Shared shape schema compatible with convertToExcalidrawElements
const ShapeSchema = z.object({
  type: z.enum([
    "rectangle",
    "ellipse",
    "diamond",
    "arrow",
    "line",
    "text",
  ]),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  angle: z.number().optional(),
  text: z.string().optional(),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  fillStyle: z.enum(["solid", "hachure", "zigzag", "cross-hatch"]).optional(),
  strokeWidth: z.number().optional(),
});

// For updates, allow a narrowed set of props we merge onto existing element
const ElementUpdateSchema = z.object({
  id: z.string(),
  props: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      angle: z.number().optional(),
      text: z.string().optional(),
      strokeColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      fillStyle: z.enum(["solid", "hachure", "zigzag", "cross-hatch"]).optional(),
      strokeWidth: z.number().optional(),
    })
    .strict(),
});

export function useExcalidrawMCP(
  api: ExcalidrawImperativeAPI | null,
  nuwaClient: NuwaClient,
) {
  useEffect(() => {
    if (!api) return;

    const transport = new PostMessageMCPTransport({
      targetWindow: window.parent,
      targetOrigin: "*",
      allowedOrigins: ["*"],
      debug: true,
      timeout: 10000,
    });

    const server = new McpServer({ name: "excalidraw-mcp", version: "1.0.0" });

    // Read tools
    server.registerTool(
      "get_scene",
      {
        title: "Get Scene",
        description: "Return full scene: elements (incl. deleted), appState, files",
        inputSchema: {},
      },
      async () => {
        const elements = api.getSceneElementsIncludingDeleted();
        const appState = api.getAppState?.();
        const files = api.getFiles?.();
        return jsonContent({ elements, appState, files });
      },
    );

    server.registerTool(
      "list_elements",
      {
        title: "List Elements",
        description:
          "Return non-deleted elements summarized for AI: id, type, x, y, width, height, angle, text, strokeColor, backgroundColor",
        inputSchema: {},
      },
      async () => {
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
      },
    );

    // Write tools
    server.registerTool(
      "set_scene",
      {
        title: "Set Scene",
        description: "Replace scene elements and/or appState",
        inputSchema: {
          elements: z.array(z.any()).optional(),
          appState: z.record(z.any()).optional(),
        },
      },
      async ({ elements, appState }) => {
        api.updateScene({
          elements: Array.isArray(elements) ? (elements as any) : undefined,
          appState: (appState as any) ?? undefined,
        });
        return jsonContent({ success: true });
      },
    );

    server.registerTool(
      "clear_scene",
      {
        title: "Clear Scene",
        description: "Remove all non-deleted elements",
        inputSchema: {},
      },
      async () => {
        api.updateScene({ elements: [] as any });
        return jsonContent({ success: true });
      },
    );

    server.registerTool(
      "add_elements",
      {
        title: "Add Elements",
        description: "Add one or more elements. Uses convertToExcalidrawElements for convenience",
        inputSchema: { elements: z.array(ShapeSchema) },
      },
      async ({ elements }) => {
        const current = api.getSceneElements();
        const created = convertToExcalidrawElements(elements as any);
        api.updateScene({ elements: [...current, ...created] as any });
        return jsonContent({ success: true, created: created.map((e: any) => e.id) });
      },
    );

    server.registerTool(
      "update_elements",
      {
        title: "Update Elements",
        description: "Update element properties by id (position, size, style, text)",
        inputSchema: { updates: z.array(ElementUpdateSchema) },
      },
      async ({ updates }) => {
        const list = Array.isArray(updates) ? updates : [];
        if (!list.length) return jsonContent({ success: false, reason: "No updates provided" });
        const byId = new Map<string, any>();
        for (const u of list) byId.set(u.id, u.props);
        const next = api.getSceneElements().map((e: any) => {
          const patch = byId.get(e.id);
          if (!patch) return e;
          // Only shallow-merge allowed keys; Excalidraw will validate.
          return { ...e, ...patch };
        });
        api.updateScene({ elements: next as any });
        return jsonContent({ success: true, updated: list.length });
      },
    );

    server.registerTool(
      "remove_elements",
      {
        title: "Remove Elements",
        description: "Remove elements by ids",
        inputSchema: { ids: z.array(z.string()).min(1) },
      },
      async ({ ids }) => {
        const toRemove = new Set(ids as string[]);
        const next = api.getSceneElements().filter((e: any) => !toRemove.has(e.id));
        api.updateScene({ elements: next as any });
        return jsonContent({ success: true, removed: [...toRemove] });
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
  }, [api, nuwaClient]);
}

