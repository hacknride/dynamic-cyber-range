import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { tanstackRouter } from '@tanstack/router-vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({routesDirectory: './src/routes'}),
    viteReact()
  ],
  test: {
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    historyApiFallback: true,
  },
});

