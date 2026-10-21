const base = require('../../jest.config.base');

module.exports = {
  ...base,
  rootDir: __dirname,
  testEnvironment: 'jsdom',
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/index.ts',
    '!src/**/*.spec.{ts,tsx}',
    '!src/main.tsx',
    '!src/config.ts',
    '!src/**/*.d.ts',
  ],
  transform: { '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }] },
  moduleNameMapper: {
    '^@/config$': '<rootDir>/test/configMock.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\.(css|svg|png)$': '<rootDir>/test-style-mock.js',
  },
};
