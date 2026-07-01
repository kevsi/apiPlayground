import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/__tests__/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'src/ai/**/__tests__/**/*.test.{ts,tsx}',
      'src/ai/**/*.test.{ts,tsx}',
      'hooks/**/__tests__/**/*.test.{ts,tsx}',
      'app/api/postman-import/__tests__/**/*.test.ts',
    ],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
