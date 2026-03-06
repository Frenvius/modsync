import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import perfectionist from 'eslint-plugin-perfectionist';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
	{ ignores: ['dist', 'vite.config.ts', 'vite.config.dev.ts'] },
	{
		files: ['**/*.{ts,tsx}'],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser
		},
		plugins: {
			prettier: prettier,
			'react-hooks': reactHooks,
			perfectionist: perfectionist,
			'react-refresh': reactRefresh,
			'unused-imports': unusedImports
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			'prettier/prettier': 'error',
			'react-hooks/exhaustive-deps': 'off',
			'unused-imports/no-unused-imports': 'error',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/interface-name-prefix': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
			'unused-imports/no-unused-vars': ['warn',
				{ vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }
			],
			'perfectionist/sort-imports': [
				'error',
				{
					order: 'asc',
					type: 'line-length',
					'internal-pattern': ['^~/'],
					'newlines-between': 'always',
					groups: ['type', ['react', 'builtin', 'external'], ['internal', 'parent', 'sibling', 'index']],
					'custom-groups': {
						value: { react: ['^react$', '^react-.'] }
					}
				}
			]
		}
	}
);
