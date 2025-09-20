import { SandpackConsumer } from "@codesandbox/sandpack-react";
import { Code, Download, Monitor, TerminalSquare } from "lucide-react";
import { Button } from "@/shadcn/components/button";
import { Tabs, TabsList, TabsTrigger } from "@/shadcn/components/tabs";

export const Header = ({
    activeView,
    setActiveView,
    showConsole,
    setShowConsole,
}: {
    activeView: "code" | "preview";
    setActiveView: (view: "code" | "preview") => void;
    showConsole: boolean;
    setShowConsole: (show: boolean) => void;
}) => {
    return (
        <div className="relative flex items-center gap-3 px-3 h-12 border-b bg-card text-card-foreground">
            {/* Left: view switch + versions */}
            <div className="flex items-center gap-2">
                <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "code" | "preview")}>
                    <TabsList>
                        <TabsTrigger value="code" className="gap-1">
                            <Code className="h-4 w-4" /> Code
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="gap-1">
                            <Monitor className="h-4 w-4" /> Preview
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Right: console toggle + download */}
            <div className="ml-auto flex items-center gap-2">
                <Button
                    variant={showConsole ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowConsole(!showConsole)}
                    title="Toggle Console"
                >
                    <TerminalSquare className="h-4 w-4" /> Console
                </Button>

                {/* We need access to current files from context; use a consumer pattern inline */}
                <DownloadButton />
            </div>
        </div>
    );
};

// Separate small component to access sandpack files for download without lifting context here.
function DownloadButton() {
    // Simple JSON download of current files (zip can be added later if needed)
    const handleDownload = (
        allFiles: Record<string, { code: string } | string> | undefined,
    ) => {
        // Sandpack's internal files shape differs when read from context.
        // Normalize to { path: string; code: string }[] then serialize.
        const normalized: Record<string, string> = {};
        for (const [path, value] of Object.entries(allFiles ?? {})) {
            if (typeof value === "string") normalized[path] = value;
            else if (value && typeof value === "object" && "code" in value)
                normalized[path] = (value as any).code ?? "";
        }

        const blob = new Blob([JSON.stringify({ files: normalized }, null, 2)], {
            type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "project.json"; // Keep simple; can change to .zip later
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <SandpackConsumer>
            {(ctx: any) => (
                <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDownload(ctx?.sandpack?.files)}
                    title="Download project as JSON"
                >
                    <Download className="h-4 w-4" /> Download
                </Button>
            )}
        </SandpackConsumer>
    );
}
