import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20', // VS Code's Extension Host is not tied to development Node 24.
  sourcemap: true,
  logLevel: 'info',
};

const configurations = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  },
  {
    ...shared,
    entryPoints: ['src/test/runTest.ts'],
    outfile: 'dist-test/runTest.js',
    packages: 'external',
  },
  {
    ...shared,
    entryPoints: ['src/test/suite/index.ts', 'src/test/suite/extension.test.ts'],
    outdir: 'dist-test/suite',
    outbase: 'src/test/suite',
    packages: 'external',
  },
];

if (watch) {
  const contexts = await Promise.all(configurations.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Watching Gungnir VS Code extension sources...');
} else {
  await Promise.all(configurations.map((options) => esbuild.build(options)));
}
