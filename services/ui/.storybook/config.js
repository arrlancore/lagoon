import { addDecorator, addParameters, configure } from '@storybook/react';
import { withA11y } from '@storybook/addon-a11y';
import { withKnobs } from '@storybook/addon-knobs';

// Add global decorators.
addDecorator(withA11y);
addParameters({
  a11y: {
    restoreScroll: true,
  },
});
addDecorator(withKnobs);

const loaderFn = () => {
  const allExports = [];

  // Import these stories first.
  allExports.push(require('./Home.stories'));

  // Automatically import all *.stories.js in these folders.
  const storiesSrc = require.context('../src', true, /\.stories\.js$/);
  storiesSrc.keys().forEach(fname => allExports.push(storiesSrc(fname)));

  return allExports;
};
configure(loaderFn, module);
