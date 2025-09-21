import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { NuwaProvider, useNuwa } from "@nuwa-ai/ui-kit";
import { useState } from "react";
import { Editor } from "./components/editor";
import { useExcalidrawMCP } from "./hooks/use-excalidraw-mcp";

export function ExcalidrawEditor() {
    const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
    const { nuwa } = useNuwa();

    // Start MCP tools when API is ready
    useExcalidrawMCP(api);

    return (
        <Editor
            initialData={nuwa.getState() as any}
            onChange={(
                elements: readonly any[],
                appState: any,
                files: Record<string, any>,
            ) => {
                nuwa.saveState({ elements, appState, files });
            }}
            onAPIReady={setApi}
        />
    );
}

export default function ExcalidrawPage() {
    return (
        <NuwaProvider className="h-screen w-full">
            <ExcalidrawEditor />
        </NuwaProvider>
    );
}
