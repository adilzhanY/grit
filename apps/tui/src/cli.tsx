/** GritTUI entry point. */
import { render } from "ink";
import { App } from "./ui/App";

const app = render(<App />);
await app.waitUntilExit();
