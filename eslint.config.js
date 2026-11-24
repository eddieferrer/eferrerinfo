import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['build/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: { semi: 'error' },
  },
  {
    files: ['*.js'],
    languageOptions: { globals: globals.node },
    rules: { semi: 'error' },
  },
];
