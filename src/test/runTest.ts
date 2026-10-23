import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { existsSync } from 'node:fs';
import { readFile, symlink } from 'node:fs/promises';
import * as path from 'node:path';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const workspacePath = path.resolve(extensionDevelopmentPath, 'test-fixtures', 'integration.code-workspace');
  const vscodeExecutablePath = await downloadAndUnzipVSCode();

  // @vscode/test-electron v2 looks for macOS Contents/MacOS/Electron, but
  // VS Code 1.110+ renamed the binary to CFBundleExecutable ("Code").
  // Create a compatibility symlink in the ephemeral test download ONLY.
  // We never modify a user's installed VS Code or code-signing resources.
  if (process.platform === 'darwin' && !existsSync(vscodeExecutablePath)
      && path.basename(vscodeExecutablePath) === 'Electron') {
    const macosDir = path.dirname(vscodeExecutablePath);
    const plist = path.join(macosDir, '..', 'Info.plist');
    const metadata = await readFile(plist, 'utf8');
    const found = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(metadata);
    const actual = found?.[1];
    if (!actual || actual === '.' || actual === '..' || path.basename(actual) !== actual
        || !existsSync(path.join(macosDir, actual))) {
      throw new Error('VS Code macOS executable could not be verified from Info.plist');
    }
    await symlink(actual, vscodeExecutablePath);
  }

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes', workspacePath],
  });
}

main().catch((error: unknown) => {
  console.error('VS Code integration tests failed:', error);
  process.exitCode = 1;
});
