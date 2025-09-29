import { Excalidraw } from "@excalidraw/excalidraw";
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
        <ExcalidrawComponent
            initialData={initialData}
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

type ExcalidrawComponentProps = {
    initialData?: any;
    onAPIReady?: (api: ExcalidrawImperativeAPI) => void;
    onChange?: (
        elements: readonly any[],
        appState: any,
        files: Record<string, any>,
    ) => void;
};

export function ExcalidrawComponent({
    initialData,
    onAPIReady,
    onChange,
}: ExcalidrawComponentProps) {
    const [excalidrawAPI, setExcalidrawAPI] =
        useState<ExcalidrawImperativeAPI | null>(null);

    useEffect(() => {
        if (excalidrawAPI && onAPIReady) onAPIReady(excalidrawAPI);
    }, [excalidrawAPI, onAPIReady]);

    const [isDark, setIsDark] = useState(false);

    // Keep a local `dark` class wrapper in sync with system preference so all
    // Tailwind `dark:` styles in subcomponents Just Work without a global toggle.
    useEffect(() => {
        const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
        if (!mq) return;
        const apply = () => setIsDark(mq.matches);
        apply();
        mq.addEventListener("change", apply);
        return () => mq.removeEventListener("change", apply);
    }, []);

    return (
        <div className="h-full w-full">
            <Excalidraw
                initialData={initialData}
                onChange={onChange}
                excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
                UIOptions={{
                    canvasActions: {
                        loadScene: false,
                        toggleTheme: true,
                    },
                }}
                theme={isDark ? "dark" : "light"}
            />
        </div>
    );
}
