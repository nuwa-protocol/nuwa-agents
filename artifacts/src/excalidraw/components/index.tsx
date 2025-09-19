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

  return (
    <div className="h-full w-full">
      <Excalidraw
        initialData={initialData}
        onChange={onChange}
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        UIOptions={{
          canvasActions: { loadScene: false },
        }}
      />
    </div>
  );
}
