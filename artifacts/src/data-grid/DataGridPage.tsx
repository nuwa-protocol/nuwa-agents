import { useEffect, useMemo, useState } from "react";
import { useNuwaClient } from "@nuwa-ai/ui-kit";
import { NuwaClientProvider } from "../note-editor/contexts/NuwaClientContext";
import { Editor } from "./components/editor";
import type { GridState } from "./types";
import { sampleGridState } from "./types";
import { useGridMCP } from "./hooks/use-grid-mcp";

const STORAGE_KEY = "dataGridState";

export default function DataGridPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [grid, setGrid] = useState<GridState>(sampleGridState());

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const apply = () => setIsDark(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const { nuwaClient } = useNuwaClient({
    onError: (error) => {
      console.error("Nuwa client error:", error);
    },
    onConnected: async () => {
      try {
        const saved = await nuwaClient.getState<{ [STORAGE_KEY]?: GridState }>();
        const next = (saved && (saved as any)[STORAGE_KEY]) || sampleGridState();
        setGrid(next);
      } catch (e) {
        console.warn("Failed to load grid state; using sample data:", e);
        setGrid(sampleGridState());
      } finally {
        setIsLoading(false);
      }
    },
    debug: false,
  });

  // Start MCP server for grid tools
  useGridMCP(grid, setGrid, nuwaClient);

  // Save on changes (naive persist; could debounce if needed)
  useEffect(() => {
    if (isLoading) return;
    const save = async () => {
      try {
        await nuwaClient.saveState({ [STORAGE_KEY]: grid });
      } catch (e) {
        console.error("Failed to save grid state:", e);
      }
    };
    // Debounce a bit to avoid too many writes during rapid edits
    const t = setTimeout(save, 300);
    return () => clearTimeout(t);
  }, [grid, isLoading, nuwaClient]);

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
        <Editor grid={grid} onChange={setGrid} />
      </NuwaClientProvider>
    </div>
  );
}
