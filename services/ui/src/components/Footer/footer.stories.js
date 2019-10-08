import React from 'react';
import Footer from './index';

export default {
  components: Footer,
  title: 'Components|Footer',
};

export const Default = () => <Footer />;
Default.story = {
  parameters: {
    notes: `
      # Remove?

      This component appears to be unused. Should it be removed? Or made useful?
    `,
  },
};
