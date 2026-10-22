import * as fs from 'node:fs';
import * as path from 'node:path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 15_000 });
  for (const file of fs.readdirSync(__dirname)) {
    if (file.endsWith('.test.js')) {
      mocha.addFile(path.join(__dirname, file));
    }
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures) reject(new Error(`${failures} integration test(s) failed`));
      else resolve();
    });
  });
}
