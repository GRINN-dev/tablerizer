import { defineConfig } from "vite"

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:4280",
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "happy-dom",
  },
})
