// ESLint 9 flat config (replaces .eslintrc.json).
// See https://eslint.org/docs/latest/use/configure/configuration-files

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  // Ignored paths. Must be in its own config block (no `files`) for ESLint
  // to treat these as global ignores. JS files (examples, config) are out
  // of scope -- this is a TypeScript library and only the .ts source +
  // tests are linted.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.d.ts',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  },

  // Base recommended rules.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TS source: Node + Jest globals, default rules.
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },

  // Tests can use require() and any-typed scaffolding.
  {
    files: ['tests/**/*.{js,ts}'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
