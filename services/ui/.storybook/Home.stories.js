import React from 'react';
import GlobalStyles from 'layouts/global';

export default {
  title: 'Home|Welcome',
};

export const toLagoon = () => (
  <GlobalStyles>
    <h1>Lagoon UI</h1>
    <p>
      This is the style guide for Lagoon.
    </p>
  </GlobalStyles>
);
toLagoon.story = {
  name: 'to Lagoon',
};
