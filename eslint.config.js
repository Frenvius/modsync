import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import perfectionist from 'eslint-plugin-perfectionist';
import prettier from 'eslint-plugin-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

const LINE_LENGTH_SORT = { type: 'line-length', order: 'asc' };

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri/target'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      perfectionist,
      prettier,
      'unused-imports': unusedImports
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['badgeVariants', 'buttonVariants', 'tabsListVariants', 'toggleVariants'] }
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prettier/prettier': 'error',
      'perfectionist/sort-imports': [
        'error',
        {
          ...LINE_LENGTH_SORT,
          groups: ['type', 'react', ['builtin', 'external'], 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          customGroups: [{ groupName: 'react', elementNamePattern: '^react(?:$|-)' }],
          internalPattern: ['^~/'],
          newlinesBetween: 1
        }
      ],
      'perfectionist/sort-enums': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-objects': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-jsx-props': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-interfaces': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-object-types': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-union-types': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-named-imports': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-named-exports': ['error', LINE_LENGTH_SORT],
      'perfectionist/sort-array-includes': ['error', LINE_LENGTH_SORT]
    }
  }
);
