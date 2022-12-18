module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  modulePaths: ['<rootDir>'],
  clearMocks: true,
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/test/prismaMock.ts'],
};
