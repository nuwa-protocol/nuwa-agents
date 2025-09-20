import { Toaster } from "sonner";
import { Editor } from "./components";

export default function CodeEditorPage() {
    return (
        <>
            <Editor />
            <Toaster visibleToasts={1} />
        </>
    );
}
