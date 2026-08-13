import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import { compression } from "vite-plugin-compression2"
import webfontDl from "vite-plugin-webfont-dl"

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
  build: {
    outDir: "../backend/app/frontend",
    emptyOutDir: true,
    target: "esnext",
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react"
            }
            if (id.includes("@tanstack")) {
              return "vendor-tanstack"
            }
            if (id.includes("recharts")) {
              return "vendor-charts"
            }
            if (id.includes("@clerk")) {
              return "vendor-clerk"
            }
            if (id.includes("katex") || id.includes("rehype-katex")) {
              return "vendor-katex"
            }
            if (id.includes("lucide-react") || id.includes("react-icons")) {
              return "vendor-icons"
            }
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      fs: path.resolve(__dirname, "./src/utils/emptyShim.ts"),
    },
  },
  define: {
    "process.env": {},
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    webfontDl({
      embed: true,
    }),
    compression({
      algorithm: "gzip",
      exclude: [/\.(br)$/i],
    }),
    compression({
      algorithm: "brotliCompress",
      exclude: [/\.(gz)$/i],
    }),
  ],
})
