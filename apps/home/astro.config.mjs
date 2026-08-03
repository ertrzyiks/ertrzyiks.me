import { defineConfig } from "astro/config";
import { stageEditorApiPlugin } from "./src/game/main/stage_editor/save_middleware";

// https://astro.build/config
export default defineConfig({
  server: {
    host: "0.0.0.0",
  },
  vite: {
    // Dev-only (apply: "serve" inside the plugin) — never registered in a
    // production build. See save_middleware.ts.
    plugins: [stageEditorApiPlugin()],
    build: {
      // This Vite version's default (Rolldown-based) CSS minifier corrupts
      // `unicode-range: U+0000-00FF` down to `U+??`, which silently drops
      // the one @fontsource/press-start-2p @font-face subset that covers
      // plain ASCII — exactly what all our in-game UI text ("End Turn"
      // etc.) needs, so the self-hosted pixel font never actually applied
      // to it. esbuild's CSS minifier doesn't have this bug.
      cssMinify: "esbuild",
    },
  },
});
