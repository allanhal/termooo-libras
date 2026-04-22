import { BrowserRouter, Route, Routes } from "react-router-dom";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./App.css";

import Home from "./pages/Home.jsx";
import Detect from "./pages/Detect.jsx";
import Admin from "./pages/Admin.jsx";
import Termooo from "./pages/Termooo.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/termooo" element={<Termooo />} />
        <Route path="/detect" element={<Detect />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
