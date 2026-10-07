import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strict,
      ...tseslint.configs.stylistic,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    },
  },
  {
    // UI never talks to the local database directly: components and pages
    // go through feature hooks/stores (`features/*/state`), which own the
    // repositories in `src/database`.
    files: [
      'src/features/**/{components,pages}/**/*.{ts,tsx}',
      'src/app/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/database', '@/database/*'],
              message:
                'UI must not import repositories directly — use a feature hook/store (features/*/state).',
            },
          ],
        },
      ],
    },
  },
  {
    // Playwright fixtures receive a callback named `use`, which the React
    // hooks rule mistakes for React's `use` hook.
    files: ['e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  prettierConfig,
)
