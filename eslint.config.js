// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');
const a11y = require('eslint-plugin-react-native-a11y');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', 'src/api/generated.ts'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Accessibility props that iOS would ignore or misread: invalid roles,
    // states and values, touchables hidden inside an accessible parent, and
    // images that Smart Invert would turn into negatives.
    files: ['src/**/*.tsx'],
    plugins: { 'react-native-a11y': a11y },
    rules: {
      ...a11y.configs.ios.rules,
      // Apple treats hints as optional, for when the label alone does not
      // say what happens; demanding one on every label makes VoiceOver
      // repeat itself.
      'react-native-a11y/has-accessibility-hint': 'off',
    },
  },
]);
