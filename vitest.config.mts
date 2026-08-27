import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Two environments on purpose. The domain layer is pure and must never load jsdom;
// only interaction-model component tests do. See ARCHITECTURE.md, "Test layers".
export default defineConfig({
  test: {
    projects: [
      {
        // `resolve.tsconfigPaths` gives us the `@/*` alias from tsconfig.json natively.
        resolve: { tsconfigPaths: true },
        test: {
          name: 'domain',
          environment: 'node',
          include: ['src/lib/**/*.test.ts'],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        plugins: [react()],
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/components/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
