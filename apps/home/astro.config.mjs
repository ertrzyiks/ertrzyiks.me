import { defineConfig } from "astro/config";
import { stageEditorSavePlugin } from "./src/game/main/stage_editor/save_middleware";

// https://astro.build/config
export default defineConfig({
  server: {
    host: "0.0.0.0",
  },
  vite: {
    // Dev-only (apply: "serve" inside the plugin) — never registered in a
    // production build. See save_middleware.ts.
    plugins: [stageEditorSavePlugin()],
  },
});
