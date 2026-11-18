// ESLint 9 flat config. Install eslint as a dev tool before running it.
export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**'],
  },
  {
    files: ['client/src/**/*.{js,jsx}', 'server/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'valid-typeof': 'error',
    },
  },
];
