import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useState } from "react";

type Props = {
  initialData?: any;
  onAPIReady?: (api: ExcalidrawImperativeAPI) => void;
  onChange?: (
    elements: readonly any[],
    appState: any,
    files: Record<string, any>,
  ) => void;
};

export function Editor({ initialData, onAPIReady, onChange }: Props) {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    if (excalidrawAPI && onAPIReady) onAPIReady(excalidrawAPI);
  }, [excalidrawAPI, onAPIReady]);

  const [isDark, setIsDark] = useState(false);

  // Keep a local `dark` class wrapper in sync with system preference so all
  // Tailwind `dark:` styles in subcomponents Just Work without a global toggle.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const apply = () => setIsDark(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={initialData}
        onChange={onChange}
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            toggleTheme: true
          },
        }}
        theme={isDark ? "dark" : "light"}
      />
    </div>
  );
}
