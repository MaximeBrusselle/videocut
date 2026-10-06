import { defineConfig } from 'vitest/config';

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: false, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
});
