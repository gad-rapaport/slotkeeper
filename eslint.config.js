import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'backups/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**/*.ts', 'tests/**/*.ts', '*.config.ts', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['server/src/cli.ts', 'tests/**/*.ts', 'scripts/**/*.{js,mjs,ts}'],
    rules: { 'no-console': 'off' },
  },
);
