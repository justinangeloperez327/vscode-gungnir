import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.unit.test.ts'],
    environment: 'node',
    coverage: { include: ['src/core/**/*.ts'] },
  },
});
