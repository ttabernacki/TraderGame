import { defineConfig } from "vite";

// GitHub Pages serves project sites under /<repo-name>/. The repo here is
// `TraderGame`, so build assets need to resolve against that base path.
// For local dev (`vite`) and `vite preview`, the base is `/`.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/TraderGame/" : "/",
}));
