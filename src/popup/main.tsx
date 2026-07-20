import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";

const container = document.getElementById("root")!;
createRoot(container).render(<Popup />);
