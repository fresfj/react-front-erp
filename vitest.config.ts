import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.worktrees/**'],
  },
  resolve: {
    alias: {
      src: path.join(process.cwd(), 'src'),
    },
  },
});
