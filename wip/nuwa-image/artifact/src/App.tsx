import { Toaster } from "sonner";
import { Editor } from "./components/Editor";

function App() {
  return (
    // <NuwaProvider className="h-screen w-full">
    <>
      <Editor />
      <Toaster visibleToasts={1} />
    </>
  )
}

export default App;
