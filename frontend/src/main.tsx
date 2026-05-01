import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./styles/globals.css";

// 防止主题闪烁：在 React 挂载前应用保存的主题
const saved = localStorage.getItem("oi-theme");
if (saved === "dark" || saved === "light") {
  document.documentElement.setAttribute("data-theme", saved);
} else {
  document.documentElement.setAttribute("data-theme", "light");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
