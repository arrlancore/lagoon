const webpackShared = require('./src/webpack.shared-config');

// Map webpack alias paths to Jest moduleNameMapper entries.
const webpackAliases = {};
Object.keys(webpackShared.alias).forEach(name => webpackAliases[`^${name}(.*)$`] = `<rootDir>/src/${name}$1`);

// Docs: https://jestjs.io/docs/en/configuration.html
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    // '^.+\\.stories\\.jsx?$': '@storybook/addon-storyshots/injectFileName',
    // @TODO: Use the above line after release of Storybook 5.2.4.
    '^.+\\.stories\\.jsx?$': '<rootDir>/src/storyshots.injectFileName',
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    ...webpackAliases,
  },
};
