const base = require('../../jest.config.base');

// jose 6 (this package's declared dependency) is ESM-only; tests reuse the CJS jose 5 that
// @toka/jwt-guard ships with so signing and verification share one implementation.
const jose = require.resolve('jose', { paths: [require.resolve('@toka/jwt-guard')] });

module.exports = {
  ...base,
  rootDir: __dirname,
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleNameMapper: { '^jose$': jose },
  collectCoverageFrom: [
    ...base.collectCoverageFrom,
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/onnx-embedding.provider.ts',
    '!src/eval/run.ts',
  ],
};
