import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
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
        </Routes>
      </div>
    </Router>
  );
}

export default App;
