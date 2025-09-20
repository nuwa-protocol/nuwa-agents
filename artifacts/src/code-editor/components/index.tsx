import {
    // Navigator, // removed: no custom URL bar in header
    SandpackCodeEditor,
    SandpackConsole,
    SandpackFileExplorer,
    SandpackLayout,
    SandpackPreview,
    SandpackProvider,
} from "@codesandbox/sandpack-react";
import { atomDark } from "@codesandbox/sandpack-themes";
import { useMemo, useState } from "react";
import { Header } from "./header";


export const Editor = () => {
    // Local UI state
    const [activeView, setActiveView] = useState<"code" | "preview">("code");
    const [showConsole, setShowConsole] = useState<boolean>(false);

    // Seed default file if none provided for a functional sandbox
    const files = useMemo(
        () => ({
            "/App.tsx": `export default function App(){\n  return <div style={{padding:16}}>Hello Sandpack</div>;\n}`,
            "/index.tsx": `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nconst root = createRoot(document.getElementById('root')!);\nroot.render(<App />);`,
            "/public/index.html": `<!doctype html>\n<html><head><meta charset=\"UTF-8\"/><title>Sandpack</title></head><body><div id='root'></div></body></html>`,
            "/package.json": JSON.stringify(
                {
                    name: "sandpack-project",
                    main: "/index.tsx",
                    dependencies: {
                        react: "latest",
                        "react-dom": "latest",
                    },
                },
                null,
                2,
            ),
        }),
        [],
    );

    return (
        <div
            className={`w-screen h-screen overflow-hidden`}
        >
            <SandpackProvider
                template={'react'}
                theme={atomDark}
                files={files}
                options={{
                    recompileMode: "delayed",
                    recompileDelay: 300,
                }}
            >
                {/* Header */}
                <Header
                    activeView={activeView}
                    setActiveView={setActiveView}
                    showConsole={showConsole}
                    setShowConsole={setShowConsole}
                />

                {/* Main content area - minus header height */}
                <div className="flex flex-col h-[calc(100vh-3rem)]">
                    <SandpackLayout style={{ height: "100%", borderRadius: 0 }}>
                        <SandpackFileExplorer style={{ height: "100%", display: activeView !== "code" ? "none" : undefined }} />
                        <SandpackCodeEditor
                            style={{ height: "100%", display: activeView !== "code" ? "none" : undefined }}
                            showInlineErrors
                            closableTabs
                            showTabs
                        />

                        <SandpackPreview
                            style={{ height: "100%", display: activeView !== "preview" ? "none" : undefined }}
                            showNavigator={false}
                            showOpenInCodeSandbox={false}
                            showRefreshButton={false}
                            // We'll render our own custom error overlay
                            showSandpackErrorOverlay={false}
                        />
                    </SandpackLayout>
                    {/* Console area */}
                    <div className="h-48 flex-none min-h-0 border-t-2" style={{ display: !showConsole ? "none" : undefined }}>
                        <SandpackConsole style={{ height: "100%" }} />
                    </div>
                </div>
            </SandpackProvider>
        </div>
    );
};
