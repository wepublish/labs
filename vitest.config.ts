import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/dorfkoenig/__tests__/**/*.test.ts'],
    setupFiles: ['src/dorfkoenig/__tests__/setup.ts'],
  },
});
