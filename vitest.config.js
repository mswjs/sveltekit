import { defineConfig } from 'vitest/config'

const ONE_MINUTE = 1000 * 60

export default defineConfig({
  test: {
    env: {
      MSW_VERSION: 'https://pkg.pr.new/msw@2692',
    },
    include: ['tests/**/*.test.{js,ts}'],
    exclude: ['tests/setup/*'],
    testTimeout: ONE_MINUTE * 3,
    hookTimeout: ONE_MINUTE * 3,
    globalSetup: ['tests/setup/global.js'],
    expect: {
      requireAssertions: true,
    },
  },
})
