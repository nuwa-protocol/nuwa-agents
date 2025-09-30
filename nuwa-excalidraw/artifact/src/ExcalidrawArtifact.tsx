import {
    convertToExcalidrawElements,
    Excalidraw,
} from "@excalidraw/excalidraw";
// Excalidraw needs its stylesheet for layout/sizing to behave correctly
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useNuwa } from "@nuwa-ai/ui-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useExcalidrawMCP } from "./hooks/UseExcalidrawMcp";

export function ExcalidrawArtifact() {
    const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
    const [initialData, setInitialData] = useState<any>(null);
    const { nuwa } = useNuwa();

    // Canonical skeleton store used by both MCP tools and debug buttons
    const [skeletons, setSkeletonsState] = useState<any[]>([]);
    const skeletonRef = useRef<any[]>(skeletons);
    useEffect(() => {
        skeletonRef.current = skeletons;
    }, [skeletons]);

    // Stable helpers we pass into the MCP hook
    const getSkeletons = useCallback(() => skeletonRef.current, []);
    const setSkeletons = useCallback(
        (next: any[] | ((prev: any[]) => any[])) => {
            setSkeletonsState((prev) =>
                typeof next === "function" ? (next as any)(prev) : next,
            );
        },
        [],
    );
    // Rebuild whole scene whenever skeletons change
    useEffect(() => {
        if (!api) return;
        const elements = convertToExcalidrawElements(skeletons as any, {
            regenerateIds: false,
        });
        api.updateScene({ elements: elements as any });
    }, [api, skeletons]);

    // Start MCP tools when API is ready
    useExcalidrawMCP(api, { getSkeletons, setSkeletons });

    useEffect(() => {
        if (nuwa) {
            setInitialData(nuwa.getState() as any);
        }
    }, [nuwa]);

    return (
        <div className="h-screen w-full relative">
            <Excalidraw
                initialData={initialData}
                onChange={(
                    elements: readonly any[],
                    appState: any,
                    files: Record<string, any>,
                ) => {
                    nuwa.saveState({ elements, appState, files });
                }}
                excalidrawAPI={(api: ExcalidrawImperativeAPI) => setApi(api)}
                UIOptions={{
                    canvasActions: {
                        loadScene: false,
                        toggleTheme: true,
                    },
                }}
            />

        </div>
    );
}
