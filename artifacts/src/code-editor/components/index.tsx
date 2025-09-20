import {
    SandpackCodeEditor,
    SandpackFileExplorer,
    SandpackLayout,
    SandpackPreview,
    SandpackProvider,
    useActiveCode,
    useSandpack,
} from "@codesandbox/sandpack-react";
import { useState } from "react";
import { Header } from "./header";


export const EditorMain = ({ activeView }: { activeView: "code" | "preview" }) => {
    const { sandpack } = useSandpack();
    // active file code
    const { code } = useActiveCode();
    // refresh the sandbox

    return (
        <div className="h-[calc(100vh-3rem)]">
            <SandpackLayout style={{ height: "100%", borderRadius: 0 }}>
                <SandpackFileExplorer
                    style={{ height: "100%", display: activeView !== "code" ? "none" : undefined }}

                />
                <SandpackCodeEditor
                    style={{ height: "100%", display: activeView !== "code" ? "none" : undefined }}
                    showTabs={false}
                    showInlineErrors
                    showLineNumbers
                    wrapContent
                />

                <SandpackPreview
                    style={{ height: "100%", display: activeView !== "preview" ? "none" : undefined }}
                    showNavigator={false}
                    showOpenInCodeSandbox={false}
                    showRefreshButton={false}
                    // We'll render our own custom error overlay
                    showSandpackErrorOverlay={true}
                />
            </SandpackLayout>
        </div>
    );
};




export const Editor = () => {
    const [activeView, setActiveView] = useState<"code" | "preview">("code");

    return (
        <div
            className={`w-screen h-screen overflow-hidden`}
        >
            <SandpackProvider
                template="react"
                options={{
                    recompileMode: "delayed",
                    recompileDelay: 300,
                }}
            >
                {/* Header */}
                <Header
                    activeView={activeView}
                    setActiveView={setActiveView}
                />
                <EditorMain activeView={activeView} />
            </SandpackProvider>
        </div>
    );
};
