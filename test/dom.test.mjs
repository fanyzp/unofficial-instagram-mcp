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
import { collectUsernamesFromDialog, extractCommentsFromPage, tagCommentLikeButton } from '../src/instagram.js';

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
// ---- Comment fixtures, mirroring the verified post-page structure ----
// Right column of stacked blocks (no ul/li): a caption row WITHOUT a Reply
// leaf (must be skipped), then comment rows with a Like/Unlike button.
const commentRow = (user, text, likes, extra, btn) => `
  <div class="row">
    <a href="/${user}/"><img alt="${user}"></a>
    <div class="body">
      <div><a href="/${user}/">${user}</a> <span>2d</span></div>
      <div>${text}</div>
      <div><button>${likes} likes</button> <span>Reply</span></div>
      ${extra}
    </div>
    <button aria-label="${btn}"><svg aria-label="${btn}"></svg></button>
  </div>`;
await page.setContent(`<!doctype html><html><body><article><div class="col">
  <div class="row">
    <a href="/cristiano/"><img alt="cristiano"></a>
    <div class="body">
      <div><a href="/cristiano/">cristiano</a> <span>2d</span></div>
      <div>Back to work</div>
    </div>
  </div>
  ${commentRow('madridtotal__', 'Te amo Cris! 🐐', '6,951', '<div>View all 36 replies</div>', 'Like')}
  ${commentRow('luxury', 'The GOAT 🐐', '35,796', '<div>See translation</div><div>View all 94 replies</div>', 'Unlike')}
</div></article></body></html>`);
const comments = await page.evaluate(extractCommentsFromPage, 10);
assert.deepStrictEqual(comments, [
  { username: 'madridtotal__', text: 'Te amo Cris! 🐐' },
  { username: 'luxury', text: 'The GOAT 🐐' },
], `comment rows: got ${JSON.stringify(comments)}`);
console.log('ok - comment rows extracted, caption row skipped');
passed++;
const oneComment = await page.evaluate(extractCommentsFromPage, 1);
assert.strictEqual(oneComment.length, 1, 'comment limit');
assert.strictEqual(oneComment[0].username, 'madridtotal__');
console.log('ok - comment limit is respected');
passed++;
const likeState = await page.evaluate(tagCommentLikeButton, 'Te amo');
const taggedLike = await page.evaluate(() => !!document.querySelector('[data-mcp-like-target="like"]'));
assert.strictEqual(likeState, 'like');
assert.ok(taggedLike, 'like target tagged');
console.log('ok - comment like button is tagged');
passed++;
const unlikeState = await page.evaluate(tagCommentLikeButton, 'The GOAT');
assert.strictEqual(unlikeState, 'unlike');
console.log('ok - already-liked comment reads as unlike');
passed++;
const missingState = await page.evaluate(tagCommentLikeButton, 'text that does not exist');
assert.strictEqual(missingState, null);
console.log('ok - unknown comment text tags nothing');
passed++;

await browser.close();
console.log(`DOM FIXTURE TESTS PASSED (${passed}/${FIXTURES.length + 5})`);
