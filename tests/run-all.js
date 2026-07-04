// Runs every test-*.js in this directory against ../dist/meteocss-card.js
// and reports a summary. Exits non-zero if any test fails.
//
//   node tests/run-all.js
//
// Without Node.js installed, VS Code's bundled runtime works too:
//   ELECTRON_RUN_AS_NODE=1 "<path to>/Code.exe" tests/run-all.js
//
// Under GitHub Actions each test file becomes a collapsible log group with
// every individual assertion, failures emit ::error annotations, and a
// per-test results table is appended to the job summary.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const isGitHub = !!process.env.GITHUB_ACTIONS;

const testFiles = fs.readdirSync(__dirname)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .sort();

const results = [];
for (const file of testFiles) {
    const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
        encoding: 'utf8',
        env: process.env,
    });
    const ok = res.status === 0;
    const output = ((res.stdout || '') + (res.stderr || '')).trim();
    const passes = (output.match(/^PASS /gm) || []).length;
    const fails = (output.match(/^FAIL /gm) || []).length;
    results.push({ file, ok, passes, fails });

    if (isGitHub) {
        // Collapsible group per test file, containing every assertion line.
        console.log(`::group::${ok ? '✅' : '❌'} ${file} (${passes} pass${fails ? `, ${fails} FAIL` : ''})`);
        console.log(output);
        console.log('::endgroup::');
        if (!ok) {
            console.log(`::error file=tests/${file}::${fails || 'crash'} failed assertion(s) in ${file}`);
        }
    } else {
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}`);
        if (!ok) console.log(output);
    }
}

const failed = results.filter(r => !r.ok).length;
const totalPass = results.reduce((n, r) => n + r.passes, 0);
const totalFail = results.reduce((n, r) => n + r.fails, 0);

// Per-test table in the GitHub job summary (visible without opening the logs).
if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
        '## Regression suite',
        '',
        `**${results.length - failed}/${results.length} test files passed** — ${totalPass} assertions pass${totalFail ? `, ${totalFail} FAIL` : ''}`,
        '',
        '| Test | Status | Assertions |',
        '|---|---|---|',
        ...results.map(r => `| \`${r.file}\` | ${r.ok ? '✅ pass' : '❌ **FAIL**'} | ${r.passes} pass${r.fails ? `, **${r.fails} fail**` : ''} |`),
        '',
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

console.log(`\n${results.length - failed}/${results.length} test files passed (${totalPass} assertions)`);
process.exit(failed === 0 ? 0 : 1);
