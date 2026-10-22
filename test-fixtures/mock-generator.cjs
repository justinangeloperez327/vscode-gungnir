#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- executable Node CJS fixture */
// Native CLI test double. Only for extension-host regression testing.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('Gungnir 1.0.0\n');
  process.exit(0);
}
if (args[0] === 'new') {
  if (args.length !== 3) process.exit(2);
  const destination = args[2];
  if (fs.existsSync(destination)) process.exit(3);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, '.gungnir-project'),
    'name=' + args[1] + '\nprofile=structured\n', { flag: 'wx' });
  process.stdout.write('Created Gungnir project: ' + destination + '\n');
  process.exit(0);
}
if (args[0] === 'make:model' && args.length === 2) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(args[1])) process.exit(4);
  const name = args[1].split(/[-_]/g).map((part) =>
    part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const relative = path.join('app', 'models', name + '.gnr');
  const dest = path.join(process.cwd(), relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, 'model ' + name + ' { string name; }\n', { flag: 'wx' });
  process.stdout.write('Created ' + relative.replace(/\\/g, '/') + '\n');
  process.exit(0);
}
process.stderr.write('unsupported fake generator arguments\n');
process.exit(5);
