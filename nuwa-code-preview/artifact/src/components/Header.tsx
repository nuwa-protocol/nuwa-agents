import { useSandpack, useSandpackNavigation } from "@codesandbox/sandpack-react";
import JSZip from "jszip";
import { Code, Download, Monitor, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Header = ({
    activeView,
    setActiveView,
}: {
    activeView: "code" | "preview";
    setActiveView: (view: "code" | "preview") => void;
}) => {
    const { refresh } = useSandpackNavigation();
    const { sandpack } = useSandpack();

    const handleDownload = async () => {
        try {
            // Create JSZip instance
            const zip = new JSZip();

            // Loop through Sandpack files and add to ZIP
            for (const [path, value] of Object.entries(sandpack.files)) {
                let content = "";

                if (typeof value === "string") {
                    content = value;
                } else if (value && typeof value === "object" && "code" in value) {
                    content = (value as any).code ?? "";
                }

                // Add to ZIP file
                zip.file(path, content);
            }

            // Generate ZIP file
            const zipBlob = await zip.generateAsync({ type: "blob" });

            // Create download link
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "project.zip";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Download ZIP file error:", error);
        }
    };

    const handleRefresh = () => {
        refresh();
        setActiveView("preview");
    };

    return (
        <div className="relative flex items-center gap-3 px-3 h-12 border-b bg-card text-card-foreground">
            {/* Left: view switch */}
            <div className="flex items-center gap-2">
                <Tabs
                    value={activeView}
                    onValueChange={(v) => setActiveView(v as "code" | "preview")}
                >
                    <TabsList>
                        <TabsTrigger value="preview" className="gap-1">
                            <Monitor className="h-4 w-4" />
                        </TabsTrigger>
                        <TabsTrigger value="code" className="gap-1">
                            <Code className="h-4 w-4" />
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={handleRefresh}
                >
                    <RefreshCcw className="h-4 w-4" />
                </Button>
            </div>

            {/* Right: download */}
            <div className="ml-auto flex items-center gap-2">
                <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={handleDownload}
                    title="Download project as ZIP file"
                >
                    <Download className="h-4 w-4" /> Download
                </Button>
            </div>
        </div>
    );
};