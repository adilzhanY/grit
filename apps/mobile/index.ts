import { registerRootComponent } from "expo";
// Side-effect import: registers the notifee background event handler before the
// app mounts (no-op in Expo Go). Must run early so headless alarm events work.
import "./src/lib/notify";
import App from "./App";

registerRootComponent(App);
