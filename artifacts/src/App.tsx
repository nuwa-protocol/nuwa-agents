import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import HomePage from "./HomePage";
import NoteEditorPage from "./note-editor/NoteEditorPage";

function App() {
  return (
    <Router>
      <div className="font-sans antialiased bg-background">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<NoteEditorPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
