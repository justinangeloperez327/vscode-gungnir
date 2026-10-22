import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-test/**', 'coverage/**', '.vscode-test/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha },
    },
  },
);
