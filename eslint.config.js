import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      'dist-debug',
      'dist-standalone',
      'coverage',
      'playwright-report',
      'test-results',
      'artifacts',
      'public',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['tools/**/*.ts', 'e2e/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    // Ядро не должно зависеть от рендера, UI и платформы (§12).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'Ядро не зависит от three.js' },
            {
              group: ['../render/*', '../ui/*', '../platform/*', '../game/*', '../audio/*'],
              message: 'Ядро не зависит от внешних слоёв',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
