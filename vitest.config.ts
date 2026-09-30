import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEBUG__: 'true',
    __APP_VERSION__: '"test"',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      reporter: ['text', 'html'],
      // §11, фаза 1: 100 % покрытие решателя тестами.
      thresholds: {
        'src/core/{solver,lineSolver,clues,puzzle,thinning}.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
