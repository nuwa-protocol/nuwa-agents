import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import CodeEditorPage from "./code-editor/CodeEditorPage";
import ExcalidrawPage from "./excalidraw/ExcalidrawPage";
import HomePage from "./HomePage";
import NoteEditorPage from "./note-editor/NoteEditorPage";

function App() {
  return (
    <Router>
      <div className="font-sans antialiased bg-background">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/note-editor" element={<NoteEditorPage />} />
          <Route path="/excalidraw" element={<ExcalidrawPage />} />
          <Route path="/code-editor" element={<CodeEditorPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
