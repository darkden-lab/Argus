/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        jsx: 'react-jsx',
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-markdown$': '<rootDir>/src/__tests__/__mocks__/react-markdown.tsx',
    '^remark-gfm$': '<rootDir>/src/__tests__/__mocks__/remark-gfm.ts',
    '^sugar-high$': '<rootDir>/src/__tests__/__mocks__/sugar-high.ts',
    '^next-intl$': '<rootDir>/src/__tests__/__mocks__/next-intl.tsx',
    '^next-intl/(.*)$': '<rootDir>/src/__tests__/__mocks__/next-intl.tsx',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/components/ui/**',
    '!src/app/**/layout.tsx',
  ],
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov'],
};

export default config;
