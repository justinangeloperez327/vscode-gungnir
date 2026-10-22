import { runTests } from '@vscode/test-electron';
import * as path from 'node:path';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const workspacePath = path.resolve(extensionDevelopmentPath, 'test-fixtures', 'sample-project');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes', workspacePath],
  });
}

main().catch((error: unknown) => {
  console.error('VS Code integration tests failed:', error);
  process.exitCode = 1;
});
