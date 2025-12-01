import { defineConfig, loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { tanstackRouter } from '@tanstack/router-vite-plugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from root directory
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');
  const frontendPort = parseInt(env.FRONTEND_PORT || '5173');
  const backendPort = parseInt(env.BACKEND_PORT || '6247');

  return {
  plugins: [
    tanstackRouter({ routesDirectory: './src/routes' }),
    viteReact(),
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
    port: frontendPort,
    strictPort: true,
    host: true,
    allowedHosts: [
      'dcr.internal.osscsuf.org',
      'localhost',
      '127.0.0.1'
    ],
    proxy: { '/api': { target: `http://localhost:${backendPort}`, changeOrigin: true } },
  }
  };
});
