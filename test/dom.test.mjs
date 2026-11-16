// DOM fixture tests for the in-page scraping helpers in src/instagram.js.
// Runs the real collectUsernamesFromDialog function inside a local headless
// Chromium against fixture HTML that mirrors the verified Instagram
// followers/following dialog (16 Nov 2026: header stats are href="#"
// links; dialog rows carry relative profile links "/<username>/").
// If no local Chromium headless shell is available, the test skips itself
// with a clear message instead of failing.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { collectUsernamesFromDialog } from '../src/instagram.js';

function findShell() {
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const exe = findShell();
if (!exe) {
  console.log('SKIP dom.test: no local Chromium headless shell under ~/.cache/ms-playwright');
  process.exit(0);
}

const row = (user, name) => `
  <div>
    <a href="/${user}/"><img alt="${user}'s profile picture" src="x"></a>
    <a href="/${user}/">${user}</a>
    <span>${name}</span>
    <button>Follow</button>
  </div>`;

const FIXTURES = [
  {
    name: 'relative hrefs, duplicates and junk links',
    html: `<div role="dialog"><h2>Followers</h2>
      ${row('alice', 'Alice A')}
      ${row('bob.smith', 'Bob Smith')}
      <a href="/p/Dabc123/">a post</a>
      <a href="/explore/">Explore</a>
      <a href="/alice/followers/">not a user row</a>
      <a href="/followers/">reserved</a>
      ${row('alice', 'Alice A')}
    </div>`,
    limit: 30,
    expect: ['alice', 'bob.smith'],
  },
  {
    name: 'absolute hrefs are normalized',
    html: `<div role="dialog"><h2>Following</h2>
      <div><a href="https://www.instagram.com/carol/"><img alt="" src="x"></a><a href="https://www.instagram.com/carol/">carol</a></div>
      <div><a href="https://www.instagram.com/dave_99/"><img alt="" src="x"></a><a href="https://www.instagram.com/dave_99/">dave_99</a></div>
    </div>`,
    limit: 30,
    expect: ['carol', 'dave_99'],
  },
  {
    name: 'display-name-only links are not mistaken for users',
    html: `<div role="dialog"><h2>Followers</h2>
      <a href="/erin/">Erin The Great</a>
      <a href="/frank/">frank</a>
    </div>`,
    limit: 30,
    expect: ['frank'],
  },
  {
    name: 'limit is respected',
    html: `<div role="dialog"><h2>Followers</h2>${row('u1', 'U One')}${row('u2', 'U Two')}${row('u3', 'U Three')}</div>`,
    limit: 2,
    expect: ['u1', 'u2'],
  },
  {
    name: 'no dialog falls back to the document',
    html: `<main><a href="/gina/"><img alt="" src="x"></a><a href="/gina/">gina</a></main>`,
    limit: 30,
    expect: ['gina'],
  },
];

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage();
let passed = 0;
for (const f of FIXTURES) {
  await page.setContent(`<!doctype html><html><body>${f.html}</body></html>`);
  const got = await page.evaluate(collectUsernamesFromDialog, f.limit);
  assert.deepStrictEqual(got, f.expect, `${f.name}: expected ${JSON.stringify(f.expect)}, got ${JSON.stringify(got)}`);
  console.log(`ok - ${f.name}`);
  passed++;
}
await browser.close();
console.log(`DOM FIXTURE TESTS PASSED (${passed}/${FIXTURES.length})`);
