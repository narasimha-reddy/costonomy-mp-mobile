const expoConfig = require('eslint-config-expo/flat');

/**
 * The rule that keeps the design system honest.
 *
 * `theme/README.md` promises that no screen writes a literal colour, and that
 * promise is what makes a future dark palette a one-file change. A promise
 * nothing checks decays within a sprint, so it is checked here.
 */
const NO_COLOR_LITERALS = {
  files: ['**/*.ts', '**/*.tsx'],
  ignores: ['theme/**'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        // #fff, #ffffff, #ffffffff
        selector: "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
        message:
          'No literal colours outside theme/. Add a semantic token to theme/colors.ts and import it from @/theme. See theme/README.md.',
      },
      {
        // rgb()/rgba()/hsl()/hsla() strings
        selector: "Literal[value=/^(?:rgba?|hsla?)\\(/]",
        message:
          'No literal colours outside theme/. Add a semantic token to theme/colors.ts and import it from @/theme. See theme/README.md.',
      },
    ],
  },
};

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'coverage/**'],
  },
  NO_COLOR_LITERALS,
];
