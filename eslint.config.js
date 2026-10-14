import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import js from '@eslint/js';


export default [
    { ignores: ['dist'] },
    // Config for source files (browser environment)
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: {
                ...globals.browser,
                React: 'readonly',
                JSX: 'readonly',
            },
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: { jsx: true },
                jsxPragma: null, // React 17+ JSX transform
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...tsPlugin.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': [
                'warn',
                { 
                    allowConstantExport: true, 
                    allowExportNames: [
                        'useAuth', 
                        'useConfirmDialog', 
                        'useTheme',
                        'useToc',
                        'parseFrontmatter',
                        'transformObsidianSyntax',
                        'ParsedFrontmatter',
                        'MarkdownEditorRef',
                        'badgeVariants',
                        'buttonVariants',
                    ] 
                },
            ],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
            '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
            'no-undef': 'off', // TypeScript handles this
        },
    },
    // Config for Node.js files (vite, vitest configs)
    {
        files: ['*.config.{ts,js}', 'vite.config.ts', 'vitest.config.ts'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: {
                ...globals.node,
            },
            parser: tsParser,
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...tsPlugin.configs.recommended.rules,
            'no-undef': 'off',
        },
    },
    // Config for scripts directory
    {
        files: ['scripts/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: {
                ...globals.node,
            },
            parser: tsParser,
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...tsPlugin.configs.recommended.rules,
            'no-undef': 'off',
        },
    },
];
