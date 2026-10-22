#!/usr/bin/env node
'use strict';
// Executable CI fixture for the actual VS Code process-task lifecycle.
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('Gungnir 1.0.2\n');
  process.exit(0);
}
if (args[0] === 'build' || args[0] === 'run') {
  if (args.length > 2 || (args.length === 2 && args[1] !== '--release')) process.exit(2);
  process.stdout.write('Gungnir task: ' + args.join(' ') + '\n');
  process.stdout.write('app/controllers/HomeController.gnr:1:1: warning[GNR9001]: Fixture diagnostic\n');
  process.exit(0);
}
if (args[0] === 'dev' && args.length === 1) {
  process.stderr.write('gungnir dev: building\n');
  setTimeout(() => {
    process.stderr.write('gungnir dev: running; watching sources, bootstrap, and configuration; templates reload on render\n');
  }, 80);
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  setInterval(() => {}, 1000);
} else {
  process.stderr.write('Mock Gungnir: Unsupported CLI command\n');
  process.exit(2);
}
