import { Excalidraw } from "@excalidraw/excalidraw";
// Excalidraw needs its stylesheet for layout/sizing to behave correctly
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useNuwa } from "@nuwa-ai/ui-kit";
import { useEffect, useState } from "react";
import { useExcalidrawMCP } from "./hooks/UseExcalidrawMcp";

export function ExcalidrawArtifact() {
    const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
    const [initialData, setInitialData] = useState<any>(null);
    const { nuwa } = useNuwa();

    // Start MCP tools when API is ready
    useExcalidrawMCP(api);

    useEffect(() => {
        if (nuwa) {
            setInitialData(nuwa.getState() as any);
        }
    }, [nuwa]);

    return (
        <div className="h-screen w-full">
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
