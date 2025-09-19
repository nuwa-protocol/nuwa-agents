import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import HomePage from "./HomePage";
import EditorPage from "./note-editor/EditorPage";

function App() {
  return (
    <Router>
      <div className="font-sans antialiased bg-background">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<EditorPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
