import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/setup/global-setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 10000,
    hookTimeout: 10000,
    env: {
      TOPUP_MIN_USD: '10.00',
      TOPUP_MAX_USD: '1000.00',
      TOPUP_INITIATED_EXPIRY_MINUTES: '30',
    },
  },
});
