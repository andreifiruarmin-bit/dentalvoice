export default {
  projects: [
    {
      // Backend/API tests — Node environment, NO setupTests
      displayName: 'api',
	  setupFiles: ['<rootDir>/test/setup.ts'],
      testMatch: ['<rootDir>/test/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            module: 'CommonJS',
          }
        }]
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      // Frontend/React tests — jsdom environment, cu setupTests
      displayName: 'frontend',
      testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
        '<rootDir>/src/**/*.{test,spec}.{ts,tsx}',
      ],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            jsx: 'react-jsx',
          }
        }]
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    }
  ]
};