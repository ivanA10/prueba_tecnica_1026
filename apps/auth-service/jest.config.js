const base = require('../../jest.config.base');

module.exports = {
  ...base,
  rootDir: __dirname,
  collectCoverageFrom: [
    ...base.collectCoverageFrom,
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/generated/**',
    '!src/testing/**',
    '!src/infrastructure/persistence/**',
    '!src/infrastructure/messaging/**',
    '!src/infrastructure/redis/**',
  ],
};
