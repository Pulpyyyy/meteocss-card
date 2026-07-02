// Runs every test-*.js in this directory against ../dist/meteocss-card.js
// and reports a summary. Exits non-zero if any test fails.
//
//   node tests/run-all.js
//
// Without Node.js installed, VS Code's bundled runtime works too:
//   ELECTRON_RUN_AS_NODE=1 "<path to>/Code.exe" tests/run-all.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testFiles = fs.readdirSync(__dirname)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .sort();

let failed = 0;
for (const file of testFiles) {
    const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
        encoding: 'utf8',
        env: process.env,
    });
    const ok = res.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}`);
    if (!ok) {
        console.log(res.stdout || '');
        console.log(res.stderr || '');
    }
}

console.log(`\n${testFiles.length - failed}/${testFiles.length} test files passed`);
process.exit(failed === 0 ? 0 : 1);
