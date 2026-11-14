import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

export default defineConfig({
  plugins: [gui()],
  build: {
    // The Desktop GUI loader accepts one self-contained CommonJS file.
    assetsInlineLimit: 1024 * 1024,
  },
})
