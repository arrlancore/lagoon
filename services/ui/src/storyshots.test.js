import initStoryshots, {
  multiSnapshotWithOptions,
} from '@storybook/addon-storyshots';

initStoryshots({
  suite: 'Jest storyshots',
  storyKindRegex: /^((?!.*?Home\|.+).)*$/,
  test: multiSnapshotWithOptions({
    createNodeMock: element => {
      // Mock React's "ref"s. See:
      // https://github.com/storybookjs/storybook/tree/master/addons/storyshots/storyshots-core#using-createnodemock-to-mock-refs
      // The following line does not create particular mocks (as it is suggested
      // by the docs), but it works well enough.
      return global.document.createElement(element.type);
    },
  }),
});
