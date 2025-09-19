import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useNuwaClient } from "@nuwa-ai/ui-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { NuwaClientProvider } from "../note-editor/contexts/NuwaClientContext";
import { Editor } from "./components";
import { useExcalidrawMCP } from "./hooks/use-excalidraw-mcp";



type SceneState = {
    elements?: readonly any[];
    appState?: Record<string, any> | null;
    files?: Record<string, any>;
} | null;

export default function ExcalidrawPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isDark, setIsDark] = useState(false);
    const [initialScene, setInitialScene] = useState<SceneState>(null);
    const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

    // Follow the user's OS theme
    useEffect(() => {
        const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
        if (!mq) return;
        const apply = () => setIsDark(mq.matches);
        apply();
        mq.addEventListener("change", apply);
        return () => mq.removeEventListener("change", apply);
    }, []);

    // Connect to Nuwa and load saved scene
    const { nuwaClient } = useNuwaClient({
        onError: (error) => {
            console.error("Nuwa client error:", error);
        },
        onConnected: async () => {
            try {
                const saved = await nuwaClient.getState<SceneState>();
                setInitialScene(saved || null);
            } catch (e) {
                console.warn("Failed to load excalidraw state; starting empty:", e);
                setInitialScene(null);
            } finally {
                setIsLoading(false);
            }
        },
        debug: false,
    });

    // Start MCP tools when API is ready
    useExcalidrawMCP(api);

    // Debounced save on change
    const saveTimer = useRef<number | null>(null);
    const pending = useRef<SceneState>(null);
    type ChangeFn = (
        elements: readonly any[],
        appState: any,
        files: Record<string, any>,
    ) => void;

    const onChange = useMemo<ChangeFn>(() => {
        return (elements, appState, files) => {
            pending.current = { elements, appState, files };
            if (saveTimer.current) window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(async () => {
                try {
                    await nuwaClient.saveState(pending.current);
                } catch (e) {
                    console.error("Failed to save excalidraw state:", e);
                }
            }, 300);
        };
    }, [nuwaClient]);

    if (isLoading) {
        return (
            <div className={isDark ? "dark" : ""}>
                <div className="h-screen w-screen flex items-center justify-center bg-white dark:bg-gray-950 text-black dark:text-white">
                    <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-gray-900 dark:border-gray-100"></div>
                </div>
            </div>
        );
    }

    return (
        <div className={isDark ? "dark" : ""}>
            <NuwaClientProvider nuwaClient={nuwaClient}>
                <div className="h-screen w-full">
                    <Editor
                        initialData={initialScene as any}
                        onChange={onChange}
                        onAPIReady={setApi}
                    />
                </div>
            </NuwaClientProvider>
        </div>
    );
}
