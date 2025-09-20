import {
    SandpackCodeEditor,
    SandpackFileExplorer,
    SandpackLayout,
    SandpackPreview,
    SandpackProvider,
    useSandpack,
} from "@codesandbox/sandpack-react";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shadcn/components/button";
import { Header } from "./header";

export const EditorMain = ({
    activeView,
}: {
    activeView: "code" | "preview";
}) => {
    const { sandpack } = useSandpack();

    useEffect(() => {
        if (sandpack.error) {
            toast.warning("Artifact Generation Error", {
                action: (
                    <Button
                        variant="default"
                        onClick={() => {
                            console.log("fix with ai");
                        }}
                    >
                        <Sparkles className="w-4 h-4" />
                        Fix with AI
                    </Button>
                ),
                closeButton: true,
                dismissible: false,
            });
        }
    }, [sandpack]);

    return (
        <div className="h-[calc(100vh-3rem)]">
            <SandpackLayout style={{ height: "100%", borderRadius: 0 }}>
                <SandpackFileExplorer
                    style={{
                        height: "100%",
                        display: activeView !== "code" ? "none" : undefined,
                    }}
                />
                <SandpackCodeEditor
                    style={{
                        height: "100%",
                        display: activeView !== "code" ? "none" : undefined,
                    }}
                    showTabs={false}
                    showInlineErrors
                    showLineNumbers
                    wrapContent
                />

                <SandpackPreview
                    style={{
                        height: "100%",
                        display: activeView !== "preview" ? "none" : undefined,
                    }}
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
        <div className={`w-screen h-screen overflow-hidden`}>
            <SandpackProvider
                template="react"
                options={{
                    recompileMode: "delayed",
                    recompileDelay: 300,
                }}
            >
                {/* Header */}
                <Header activeView={activeView} setActiveView={setActiveView} />
                <EditorMain activeView={activeView} />
            </SandpackProvider>
        </div>
    );
};
