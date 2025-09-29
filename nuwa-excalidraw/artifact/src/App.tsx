import { NuwaProvider } from "@nuwa-ai/ui-kit";
import { ExcalidrawArtifact } from "./ExcalidrawArtifact";

function App() {
  return (
    <NuwaProvider className="h-screen w-full">
      <ExcalidrawArtifact />
    </NuwaProvider>
  );
}

export default App;
