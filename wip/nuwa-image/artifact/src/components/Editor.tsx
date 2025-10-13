import {
    Brush,
    Image as ImageIcon,
    ImagePlus,
    Square,
    Type as TypeIcon,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Group,
    Image as KonvaImage,
    Layer,
    Line,
    Rect,
    Stage,
    Text,
    Transformer,
} from "react-konva";
import { type TreeDataItem, TreeView } from "@/components/tree-view";
import { Button } from "@/components/ui/button";

type OverlayType = "rect" | "text" | "image" | "brush";

type Overlay = {
    id: string;
    type: OverlayType;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    fill?: string;
    stroke?: string;
    opacity?: number;
    text?: string;
    src?: string; // for image overlays
    scaleX?: number;
    scaleY?: number;
    // brush
    points?: number[]; // x1,y1,x2,y2,... in stage coords
    strokeWidth?: number;
};

type VersionNode = {
    id: string;
    parentId: string | null;
    imageDataUrl: string;
    label?: string;
    prompt?: string;
    createdAt: number;
    children?: VersionNode[];
};

function uid(prefix = "id"): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous"; // allow stage export when loading remote
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

export function Editor() {
    // Stage & sizing
    const stageRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [stageSize, setStageSize] = useState({ width: 960, height: 540 });

    useEffect(() => {
        const onResize = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            setStageSize({
                width: Math.max(rect.width - 320, 320),
                height: Math.max(rect.height - 140, 320),
            });
        };
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Root image state
    const [rootImageUrl, setRootImageUrl] = useState<string | null>(null);
    const [rootImage, setRootImage] = useState<HTMLImageElement | null>(null);
    // No filter logic for now (AI is mocked by drawing prompt text on generate)

    // Overlays
    const [overlays, setOverlays] = useState<Overlay[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Versions
    const [versionRoot, setVersionRoot] = useState<VersionNode | null>(null);
    const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

    // Prompt
    const [prompt, setPrompt] = useState<string>("");
    const [viewScale, setViewScale] = useState<number>(1);
    const [activeTool, setActiveTool] = useState<"select" | "brush">("select");
    const isDrawingRef = useRef(false);
    const brushIdRef = useRef<string | null>(null);

    // Load root image element whenever url changes
    useEffect(() => {
        let active = true;
        if (!rootImageUrl) {
            setRootImage(null);
            return;
        }
        loadHtmlImage(rootImageUrl)
            .then((img) => {
                if (!active) return;
                setRootImage(img);
                // Fit stage to image if available
                const maxW = containerRef.current?.clientWidth ?? stageSize.width;
                const maxH = containerRef.current?.clientHeight ?? stageSize.height;
                const padW = 360; // leave space for panel
                const padH = 160; // header + some padding
                const availW = Math.max(320, maxW - padW);
                const availH = Math.max(240, maxH - padH);
                const scale = Math.min(availW / img.width, availH / img.height, 1);
                const targetW = Math.round(img.width * scale);
                const targetH = Math.round(img.height * scale);
                setStageSize({ width: targetW, height: targetH });
            })
            .catch(() => {
                // ignore
            });
        return () => {
            active = false;
        };
    }, [rootImageUrl]);

    // Persist editor state (except large images) in localStorage
    useEffect(() => {
        const state = {
            rootImageUrl,
            overlays,
            currentVersionId,
            // versionRoot is large; store minimal tree for restore
            versions: versionRoot,
        };
        try {
            localStorage.setItem("nuwa-image-state", JSON.stringify(state));
        } catch {
            // ignore storage failures
        }
    }, [rootImageUrl, overlays, versionRoot, currentVersionId]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("nuwa-image-state");
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed.rootImageUrl) setRootImageUrl(parsed.rootImageUrl);
            if (parsed.overlays) setOverlays(parsed.overlays);
            if (parsed.versions) setVersionRoot(parsed.versions);
            if (parsed.currentVersionId) setCurrentVersionId(parsed.currentVersionId);
        } catch {
            // ignore bad state
        }
    }, []);

    // Selection helpers
    const getPointer = () => {
        const stage: any = stageRef.current;
        if (!stage) return null;
        const pos = stage.getPointerPosition();
        if (!pos) return null;
        // adjust for CSS zoom
        return { x: pos.x / viewScale, y: pos.y / viewScale };
    };

  const onStageMouseDown = (e: any) => {
    const stage = e.target.getStage();
    if (activeTool === "brush") {
      const p = getPointer();
      if (!p) return;
      // Begin a new stroke and clear any previous selection
      setSelectedId(null);
      isDrawingRef.current = true;
      const id = uid("brush");
      brushIdRef.current = id;
      setOverlays((prev) => [
        ...prev,
                {
                    id,
                    type: "brush",
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 0,
                    stroke: "#22c55e",
                    strokeWidth: 4,
                    opacity: 1,
                    points: [p.x, p.y],
                },
            ]);
      return;
    }
        // clicked on empty area - remove selection
        const clickedOnEmpty = e.target === stage;
        if (clickedOnEmpty) setSelectedId(null);
    };

    const onStageMouseMove = (e: any) => {
        if (!isDrawingRef.current || activeTool !== "brush" || !brushIdRef.current)
            return;
        const p = getPointer();
        if (!p) return;
        const id = brushIdRef.current;
        setOverlays((prev) =>
            prev.map((o) =>
                o.id === id ? { ...o, points: [...(o.points || []), p.x, p.y] } : o,
            ),
        );
    };

    const onStageMouseUp = () => {
        if (isDrawingRef.current) {
            isDrawingRef.current = false;
            brushIdRef.current = null;
        }
    };

    const addRect = () => {
        const id = uid("rect");
        setOverlays((prev) => [
            ...prev,
            {
                id,
                type: "rect",
                x: 40,
                y: 40,
                width: 160,
                height: 100,
                fill: "#22c55e55",
                stroke: "#16a34a",
                opacity: 1,
                rotation: 0,
            },
        ]);
        setSelectedId(id);
    };

    const addText = () => {
        const id = uid("text");
        setOverlays((prev) => [
            ...prev,
            {
                id,
                type: "text",
                x: 60,
                y: 60,
                width: 200,
                height: 40,
                text: "Hello",
                fill: "#ffffff",
                opacity: 1,
            },
        ]);
        setSelectedId(id);
    };

    const onAddOverlayImage = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const id = uid("img");
            setOverlays((prev) => [
                ...prev,
                {
                    id,
                    type: "image",
                    x: 80,
                    y: 80,
                    width: 200,
                    height: 200,
                    src: dataUrl,
                    opacity: 1,
                },
            ]);
            setSelectedId(id);
        };
        reader.readAsDataURL(file);
    };

    const onLoadRootImageFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setRootImageUrl(dataUrl);
            setOverlays([]);
            const id = uid("v");
            const newRoot: VersionNode = {
                id,
                parentId: null,
                imageDataUrl: dataUrl,
                label: "root",
                createdAt: Date.now(),
                children: [],
            };
            setVersionRoot(newRoot);
            setCurrentVersionId(id);
        };
        reader.readAsDataURL(file);
    };

    // No prompt-apply side effects; prompt is drawn during Generate

  // Generate merged image → new version node
  const generateVersion = async () => {
    if (!stageRef.current || !rootImage) return;
    setSelectedId(null);

        // Compose into an offscreen canvas; draw root + overlays + prompt text (mock AI)
        const canvas = document.createElement("canvas");
        canvas.width = stageSize.width;
        canvas.height = stageSize.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) return;

        // 1) Draw root (no filters for now)
        ctx.save();
        ctx.drawImage(rootImage, 0, 0, stageSize.width, stageSize.height);
        ctx.restore();

        // 2) Draw overlays exported from Stage
        const overlayUrl: string = stageRef.current.toDataURL({ pixelRatio: 1 });
        await new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                resolve();
            };
            img.src = overlayUrl;
        });

        // 3) Draw prompt text at the bottom as a mock of AI modification
        if (prompt.trim().length > 0) {
            const pad = 12;
            const maxWidth = stageSize.width - pad * 2;
            const lineHeight = 24;
            ctx.save();
            ctx.font = "20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = "#ffffff";
            // simple word wrap
            const words = prompt.trim().split(/\s+/);
            const lines: string[] = [];
            let current = "";
            for (const w of words) {
                const test = current.length ? current + " " + w : w;
                if (ctx.measureText(test).width <= maxWidth) {
                    current = test;
                } else {
                    if (current) lines.push(current);
                    current = w;
                }
            }
            if (current) lines.push(current);
            // cap to 3 lines
            const shown = lines.slice(-3);
            const textHeight = shown.length * lineHeight + pad;
            // background box
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(
                0,
                stageSize.height - textHeight - pad,
                stageSize.width,
                textHeight + pad,
            );
            // draw text
            ctx.fillStyle = "#ffffff";
            shown.forEach((line, i) => {
                ctx.fillText(
                    line,
                    pad,
                    stageSize.height - pad - (shown.length - 1 - i) * lineHeight,
                );
            });
            ctx.restore();
        }

        const composedUrl = canvas.toDataURL("image/png");

    const id = uid("v");
    const newNode: VersionNode = {
      id,
      parentId: currentVersionId, // will be updated when attaching
      imageDataUrl: composedUrl,
      label: prompt ? prompt.slice(0, 40) : undefined,
      prompt: prompt || undefined,
      createdAt: Date.now(),
      children: [],
    };

    if (!versionRoot) {
      // Edge case: should not happen because root is created on load
      setVersionRoot(newNode);
    } else {
      // Decide where to attach the new node based on the rule:
      // - If generating from root: attach under root (level 1)
      // - If generating from an older version (not latest among its siblings): attach as child of that node (deeper level)
      // - If generating from latest among its siblings: attach as a sibling (same parent)

      // Helper to find node and its parent
      const findNodeAndParent = (
        node: VersionNode,
        targetId: string,
        parent: VersionNode | null = null,
      ): { node: VersionNode | null; parent: VersionNode | null } => {
        if (node.id === targetId) return { node, parent };
        for (const child of node.children || []) {
          const res = findNodeAndParent(child, targetId, node);
          if (res.node) return res;
        }
        return { node: null, parent: null };
      };

      const cloned = JSON.parse(JSON.stringify(versionRoot)) as VersionNode;
      let parentForNew: VersionNode | null = cloned;

      if (currentVersionId && currentVersionId !== cloned.id) {
        const { node: cur, parent } = findNodeAndParent(cloned, currentVersionId);
        if (cur && parent) {
          const siblings = parent.children || [];
          const isLatest = siblings.length > 0 && siblings[siblings.length - 1].id === cur.id;
          parentForNew = isLatest ? parent : cur;
        } else if (cur && !parent) {
          // cur is root
          parentForNew = cloned;
        } else {
          parentForNew = cloned; // fallback to root
        }
      } else {
        // generating from root
        parentForNew = cloned;
      }

      parentForNew.children = parentForNew.children || [];
      parentForNew.children.push({ ...newNode, parentId: parentForNew.id });
      setVersionRoot(cloned);
    }

        // Replace root image with composed result
        setRootImageUrl(composedUrl);
        setOverlays([]);
        setCurrentVersionId(id);
    };

    // Restore version as current root
    const restoreVersion = (node: VersionNode) => {
        setRootImageUrl(node.imageDataUrl);
        setOverlays([]);
        setCurrentVersionId(node.id);
    };

    // Delete selected overlay with Delete key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Delete" || e.key === "Backspace") {
                setOverlays((prev) => prev.filter((o) => o.id !== selectedId));
                // Always clear selection to ensure transformer is removed
                setSelectedId(null);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedId, overlays]);

    // Helper to render overlay nodes with transformer
    const [trRef, setTrRef] = useState<any>(null);
    const selectedNodeRef = useRef<any>(null);

    useEffect(() => {
        if (!trRef) return;
        if (selectedId && selectedNodeRef.current) {
            trRef.nodes([selectedNodeRef.current]);
        } else {
            // Clear transformer selection when nothing is selected
            trRef.nodes([]);
        }
        trRef.getLayer()?.batchDraw();
    }, [trRef, selectedId, overlays]);

    // Ensure selectedId is cleared if the selected overlay no longer exists
    useEffect(() => {
        if (!selectedId) return;
        if (!overlays.some((o) => o.id === selectedId)) {
            setSelectedId(null);
        }
    }, [overlays, selectedId]);

    const OverlayNode = ({ overlay }: { overlay: Overlay }) => {
        const common = {
            x: overlay.x,
            y: overlay.y,
            width: overlay.width,
            height: overlay.height,
            rotation: overlay.rotation || 0,
            opacity: overlay.opacity ?? 1,
            draggable: true,
            onClick: () => setSelectedId(overlay.id),
            onTap: () => setSelectedId(overlay.id),
            onDragEnd: (e: any) => {
                const { x, y } = e.target.position();
                setOverlays((prev) =>
                    prev.map((o) => (o.id === overlay.id ? { ...o, x, y } : o)),
                );
            },
        } as any;

        if (overlay.type === "rect") {
            return (
                <Rect
                    ref={overlay.id === selectedId ? selectedNodeRef : undefined}
                    {...common}
                    fill={overlay.fill || "#4ade8055"}
                    stroke={overlay.stroke || "#22c55e"}
                    strokeWidth={2}
                    cornerRadius={8}
                    onTransformEnd={(e: any) => {
                        const node = e.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        const rotation = node.rotation();
                        const newWidth = Math.max(5, node.width() * scaleX);
                        const newHeight = Math.max(5, node.height() * scaleY);
                        node.scaleX(1);
                        node.scaleY(1);
                        setOverlays((prev) =>
                            prev.map((o) =>
                                o.id === overlay.id
                                    ? { ...o, width: newWidth, height: newHeight, rotation }
                                    : o,
                            ),
                        );
                    }}
                />
            );
        }
        if (overlay.type === "text") {
            return (
                <Group
                    ref={overlay.id === selectedId ? selectedNodeRef : undefined}
                    {...common}
                >
                    <Text
                        x={0}
                        y={0}
                        width={overlay.width}
                        height={overlay.height}
                        text={overlay.text || ""}
                        fill={overlay.fill || "#ffffff"}
                        fontSize={24}
                        align="left"
                        verticalAlign="middle"
                        draggable={false}
                    />
                </Group>
            );
        }
        if (overlay.type === "image") {
            const [img, setImg] = useState<HTMLImageElement | null>(null);
            useEffect(() => {
                let mounted = true;
                if (!overlay.src) return;
                loadHtmlImage(overlay.src).then((im) => mounted && setImg(im));
                return () => {
                    mounted = false;
                };
            }, [overlay.src]);
            return (
                <KonvaImage
                    ref={overlay.id === selectedId ? selectedNodeRef : undefined}
                    {...common}
                    image={img || undefined}
                />
            );
        }
        if (overlay.type === "brush") {
            return (
                <Group
                    ref={overlay.id === selectedId ? selectedNodeRef : undefined}
                    x={overlay.x || 0}
                    y={overlay.y || 0}
                    rotation={overlay.rotation || 0}
                    opacity={overlay.opacity ?? 1}
                    draggable
                    onClick={() => setSelectedId(overlay.id)}
                    onDragEnd={(e: any) => {
                        const { x, y } = e.target.position();
                        setOverlays((prev) =>
                            prev.map((o) => (o.id === overlay.id ? { ...o, x, y } : o)),
                        );
                    }}
                >
                    <Rect x={0} y={0} width={0} height={0} opacity={0} />
                    {/* Invisible rect ensures transformer selection works */}
                    <Line
                        points={overlay.points || []}
                        stroke={overlay.stroke || "#22c55e"}
                        strokeWidth={overlay.strokeWidth || 4}
                        lineCap="round"
                        lineJoin="round"
                        tension={0}
                    />
                </Group>
            );
        }
        return null;
    };

    // Map VersionNode -> TreeDataItem for TreeView (name-only with thumbnail tooltip)
    const toTreeData = useCallback(
        (node: VersionNode): TreeDataItem => ({
            id: node.id,
            name: node.label || new Date(node.createdAt).toLocaleTimeString(),
            thumbnail: node.imageDataUrl,
            onClick: () => restoreVersion(node),
            children: (node.children || []).map(toTreeData),
        }),
        [],
    );

    // refs for hidden file inputs
    const rootFileRef = useRef<HTMLInputElement | null>(null);
    const overlayFileRef = useRef<HTMLInputElement | null>(null);

    return (
        <div
            ref={containerRef}
            className="w-screen h-screen flex flex-col bg-background text-foreground"
        >
            {/* Header */}
            <div className="h-12 px-4 border-b flex items-center gap-2">
                <input
                    ref={rootFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onLoadRootImageFile(f);
                        // reset value to allow re-selecting same file
                        if (e.target) e.target.value = "";
                    }}
                />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rootFileRef.current?.click()}
                    title="Choose Image"
                >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Choose Image
                </Button>

                <div className="mx-2 w-px h-6 bg-border" />
                <input
                    ref={overlayFileRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onAddOverlayImage(f);
                        if (e.target) e.target.value = "";
                    }}
                />
                {/* Tools: brush, rect, text, overlay image, zoom */}
                <Button
                    size="sm"
                    variant={activeTool === "brush" ? "default" : "outline"}
                    onClick={() =>
                        setActiveTool((t) => (t === "brush" ? "select" : "brush"))
                    }
                    title="Brush"
                >
                    <Brush className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={addRect} title="Rectangle">
                    <Square className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={addText} title="Text">
                    <TypeIcon className="w-4 h-4" />
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => overlayFileRef.current?.click()}
                    title="Add Overlay Image"
                >
                    <ImagePlus className="w-4 h-4" />
                </Button>
                <div className="ml-2 flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            setViewScale((s) =>
                                Math.max(0.25, parseFloat((s - 0.25).toFixed(2))),
                            )
                        }
                        title="Zoom Out"
                    >
                        <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            setViewScale((s) =>
                                Math.min(4, parseFloat((s + 0.25).toFixed(2))),
                            )
                        }
                        title="Zoom In"
                    >
                        <ZoomIn className="w-4 h-4" />
                    </Button>
                </div>
                <div className="flex-1" />
            </div>

            {/* Main content */}
            <div className="flex-1 flex min-h-0">
                <div className="flex-1 flex items-center justify-center bg-muted/20">
                    {rootImage ? (
                        <div className="flex flex-col items-start">
                            <div
                                style={{
                                    position: "relative",
                                    border: "1px solid var(--border)",
                                }}
                            >
                                <div
                                    style={{
                                        transform: `scale(${viewScale})`,
                                        transformOrigin: "top left",
                                        width: stageSize.width,
                                        height: stageSize.height,
                                        position: "relative",
                                    }}
                                >
                                    {/* Root preview as <img> */}
                                    <img
                                        src={rootImageUrl || undefined}
                                        alt="root"
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "fill",
                                        }}
                                    />
                                    {/* Overlays rendered in a transparent Konva stage above */}
                                    <Stage
                                        ref={stageRef}
                                        width={stageSize.width}
                                        height={stageSize.height}
                                        onMouseDown={onStageMouseDown}
                                        onMouseMove={onStageMouseMove as any}
                                        onMouseUp={onStageMouseUp as any}
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            background: "transparent",
                                        }}
                                    >
                                        <Layer>
                                            {overlays.map((o) => (
                                                <OverlayNode key={o.id} overlay={o} />
                                            ))}
                                            {/* Transformer shows for selected node */}
                                            <Transformer
                                                ref={setTrRef as any}
                                                rotateEnabled={true}
                                                enabledAnchors={[
                                                    "top-left",
                                                    "top-right",
                                                    "bottom-left",
                                                    "bottom-right",
                                                ]}
                                            />
                                        </Layer>
                                    </Stage>
                                </div>
                            </div>
                            {/* Footer prompt input under the canvas */}
                            <div className="mt-2 w-full pr-2 flex items-center gap-2">
                                <input
                                    type="text"
                                    className="w-[min(640px,80vw)] text-sm px-2 py-1 border rounded"
                                    placeholder="Describe the change... (prompt will be stamped on generate)"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                />
                                <Button size="sm" variant="default" onClick={generateVersion}>
                                    Generate
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            Load a root image to start editing.
                        </div>
                    )}
                </div>

                {/* Side panel: Versions only */}
                <div className="w-80 border-l p-3 overflow-auto">
                    <div className="text-sm font-medium mb-2">Versions</div>
                    {versionRoot && (versionRoot.children?.length || 0) > 0 ? (
                        <TreeView
                            key={currentVersionId || versionRoot.id}
                            data={(versionRoot.children || []).map(toTreeData)}
                            initialSelectedItemId={
                                currentVersionId && currentVersionId !== versionRoot.id
                                    ? currentVersionId
                                    : undefined
                            }
                            expandAll
                            hideChevron
                            onSelectChange={(item) => {
                                if (!item) return;
                                setCurrentVersionId(item.id);
                            }}
                            className="max-h-[calc(100vh-6rem)] overflow-auto"
                        />
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            No versions yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Editor;
