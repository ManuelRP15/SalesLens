import { createRoot } from "react-dom/client";
import { Workspace } from "./Workspace";

const container = document.getElementById("root")!;
createRoot(container).render(<Workspace />);
