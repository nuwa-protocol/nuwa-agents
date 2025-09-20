import { Sandpack } from "@codesandbox/sandpack-react";
import { atomDark } from "@codesandbox/sandpack-themes";

export interface EditorProps {
    theme?: "light" | "dark";
    initialFiles?: Record<string, string>;
    initialCode?: string;
    initialPackages?: string[];
    initialDependencies?: Record<string, string>;
    initialEnvironment?: Record<string, string>;
}

export const Editor = ({
    theme = "light",
    initialFiles = {},
    initialCode,
    initialPackages,
    initialDependencies,
    initialEnvironment,
}: EditorProps) => {

    return (
        <div className="max-h-screen w-screen">
            <Sandpack
                files={initialFiles}
                theme={atomDark}
                template="react"
                options={{ editorHeight: "100%" }}
            />

        </div>
    );
};
