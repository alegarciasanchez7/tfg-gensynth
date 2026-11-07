import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    // userEvent-driven tests take ~1s locally but several times that on shared CI runners
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      // lcov feeds SonarQube; text prints a summary in the CI log
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    },
  },
})
