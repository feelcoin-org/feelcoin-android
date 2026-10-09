import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import MobileApp from "./MobileApp";
import "./styles.css";
import "./mobile-override.css";

const android = /Android/i.test(navigator.userAgent);
if (android) document.body.classList.add("feel-mobile-body");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {android ? <MobileApp /> : <App />}
  </React.StrictMode>,
);
