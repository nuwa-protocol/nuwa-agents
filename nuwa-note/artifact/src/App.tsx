import { NuwaProvider } from "@nuwa-ai/ui-kit";
import { NoteEditorArtifact } from "./NoteEditorArtifact";

function App() {
  return (
    <NuwaProvider className="h-screen w-full">
      <NoteEditorArtifact />
    </NuwaProvider>
  );
}

export default App;
