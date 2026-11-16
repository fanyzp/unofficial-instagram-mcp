#!/usr/bin/env node
// Official installer for unofficial-instagram-mcp: installs the MCP server and
// the Agent Skill into the agent harnesses (clients) the user picks, in one flow.
//   node bin/install.mjs                      -> interactive (arrow key pickers)
//   node bin/install.mjs --harness claude-code,opencode --scope user --yes
//   node bin/install.mjs --all --scope project --dry-run
// No dependencies. Existing config files are merged, never replaced wholesale.
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'server.js');
const SKILL_SRC = join(ROOT, 'skills', 'unofficial-instagram-mcp');
const HOME = homedir();
const CWD = process.cwd();
const MCP_ENV = { CDP_URL: 'http://127.0.0.1:9222', IG_DRY_RUN: 'true' };
// When the installer runs through npx, the local path points into the npx cache,
// which npm may clean later. In that mode the config uses the npx command itself
// so it stays valid permanently.
const VIA_NPX = ROOT.split(/[\\/]/).includes('_npx');
const NPX_ARGS = ['-y', 'github:fanyzp/unofficial-instagram-mcp'];

// format: 'mcpServers' (generic JSON) | 'opencode' (JSON with mcp key) | 'codex' (TOML) | null (skill only)
const HARNESSES = [
  { id: 'claude-code', label: 'Claude Code', format: 'mcpServers',
    mcp: { user: join(HOME, '.claude.json'), project: join(CWD, '.mcp.json') },
    skill: { user: join(HOME, '.claude', 'skills'), project: join(CWD, '.claude', 'skills') } },
  { id: 'opencode', label: 'OpenCode', format: 'opencode',
    mcp: { user: join(HOME, '.config', 'opencode', 'opencode.json'), project: join(CWD, 'opencode.json') },
    skill: { user: join(HOME, '.config', 'opencode', 'skills'), project: join(CWD, '.opencode', 'skills') } },
  { id: 'cursor', label: 'Cursor', format: 'mcpServers',
    mcp: { user: join(HOME, '.cursor', 'mcp.json'), project: join(CWD, '.cursor', 'mcp.json') },
    skill: { user: join(HOME, '.cursor', 'skills'), project: join(CWD, '.cursor', 'skills') } },
  { id: 'codex', label: 'Codex', format: 'codex',
    mcp: { user: join(HOME, '.codex', 'config.toml'), project: join(CWD, '.codex', 'config.toml') },
    skill: { user: join(HOME, '.codex', 'skills'), project: join(CWD, '.agents', 'skills') } },
  { id: 'gemini-cli', label: 'Gemini CLI', format: 'mcpServers',
    mcp: { user: join(HOME, '.gemini', 'settings.json'), project: join(CWD, '.gemini', 'settings.json') },
    skill: { user: join(HOME, '.gemini', 'skills'), project: join(CWD, '.gemini', 'skills') } },
  { id: 'generic', label: 'Generic (.agents/skills, skill only)', format: null,
    mcp: null,
    skill: { user: join(HOME, '.agents', 'skills'), project: join(CWD, '.agents', 'skills') } },
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const dryRun = flag('dry-run');
const log = (s) => console.log(s);
const plan = (s) => log(dryRun ? `[dry-run] ${s}` : s);

if (flag('list')) {
  for (const h of HARNESSES) log(`${h.id.padEnd(12)} ${h.label}`);
  process.exit(0);
}

function readJson(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`Config file is not valid JSON: ${path}`); }
}
function writeFile(path, content) {
  if (dryRun) { plan(`write ${path}`); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  log(`  written: ${path}`);
}

function installMcp(h, scope) {
  if (!h.mcp) { log('  MCP: skipped (this harness is skill only; register the server manually, see the README)'); return; }
  const path = h.mcp[scope];
  if (h.format === 'codex') {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur.includes('[mcp_servers.instagram]')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    const cmd = VIA_NPX ? 'npx' : 'node';
    const argList = (VIA_NPX ? NPX_ARGS : [SERVER]).map((a) => `"${a.replace(/\\/g, '\\\\')}"`).join(', ');
    const block = `${cur && !cur.endsWith('\n') ? '\n' : ''}[mcp_servers.instagram]\ncommand = "${cmd}"\nargs = [${argList}]\n\n[mcp_servers.instagram.env]\nCDP_URL = "${MCP_ENV.CDP_URL}"\nIG_DRY_RUN = "${MCP_ENV.IG_DRY_RUN}"\n`;
    writeFile(path, cur + block);
    return;
  }
  const cfg = readJson(path);
  if (h.format === 'opencode') {
    cfg.mcp = cfg.mcp || {};
    cfg.mcp.instagram = { type: 'local', command: VIA_NPX ? ['npx', ...NPX_ARGS] : ['node', SERVER], enabled: true, environment: MCP_ENV };
  } else {
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers.instagram = VIA_NPX ? { command: 'npx', args: NPX_ARGS, env: MCP_ENV } : { command: 'node', args: [SERVER], env: MCP_ENV };
  }
  writeFile(path, JSON.stringify(cfg, null, 2) + '\n');
}

function installSkill(h, scope) {
  const dest = join(h.skill[scope], 'unofficial-instagram-mcp');
  if (existsSync(dest) && !flag('force')) { log(`  Skill: already present at ${dest}, skipped (use --force to overwrite)`); return; }
  if (dryRun) { plan(`copy skill -> ${dest}`); return; }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(SKILL_SRC, dest, { recursive: true });
  log(`  Skill: installed at ${dest}`);
}

// ---------- Interactive pickers (arrow keys, no dependencies) ----------

const ESC = '\x1b';
function picker({ title, hint, items, multi }) {
  return new Promise((resolvePick) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let cursor = 0;
    const checked = new Set(multi ? [] : [0]);
    let rendered = 0;

    const lines = () => {
      const out = [`? ${title}`];
      items.forEach((label, i) => {
        const pointer = i === cursor ? '❯' : ' ';
        const box = multi ? (checked.has(i) ? '◉' : '◯') : (checked.has(i) ? '●' : '○');
        out.push(`${pointer} ${box} ${label}`);
      });
      out.push(`  ${hint}`);
      return out;
    };
    const render = () => {
      if (rendered) stdout.write(`${ESC}[${rendered}A`);
      const out = lines();
      for (const line of out) stdout.write(`\r${ESC}[K${line}\n`);
      rendered = out.length;
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write(`${ESC}[?25h`);
    };
    const finish = (value) => { cleanup(); resolvePick(value); };
    const onData = (buf) => {
      const s = buf.toString('utf8');
      if (s === '\x03') { cleanup(); log('\nCancelled.'); process.exit(130); }
      if (s === `${ESC}[A` || s === 'k') cursor = (cursor - 1 + items.length) % items.length;
      else if (s === `${ESC}[B` || s === 'j') cursor = (cursor + 1) % items.length;
      else if (multi && s === ' ') { checked.has(cursor) ? checked.delete(cursor) : checked.add(cursor); }
      else if (multi && (s === 'a' || s === 'A')) {
        if (checked.size === items.length) checked.clear(); else items.forEach((_, i) => checked.add(i));
      } else if (!multi && s === ' ') { checked.clear(); checked.add(cursor); }
      else if (s === '\r' || s === '\n') {
        if (multi && checked.size === 0) { hintFlash(); return; }
        return finish(multi ? [...checked].sort((x, y) => x - y) : cursor);
      } else return;
      render();
    };
    let flashTimer = null;
    const hintFlash = () => {
      const old = hint;
      hint = 'Select at least one entry (space to toggle).';
      render();
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { hint = old; render(); }, 1200);
    };
    stdout.write(`${ESC}[?25l`);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    render();
  });
}

async function askNumberedScope() {
  const rl = createInterface({ input: process.stdin });
  const answer = await rl.question('Scope? [1] User (all projects)  [2] This project only (default 1): ');
  rl.close();
  return answer.trim() === '2' ? 'project' : 'user';
}
async function askNumberedHarnesses() {
  const rl = createInterface({ input: process.stdin });
  log('Harnesses:');
  HARNESSES.forEach((h, i) => log(` ${i + 1}. ${h.label}`));
  const pick = (await rl.question('\nChoose (comma separated, e.g. 1,2): ')).trim();
  rl.close();
  return pick.split(',').map((x) => HARNESSES[Number(x.trim()) - 1]?.id).filter(Boolean);
}

// ---------- Main flow ----------

let scope = opt('scope');
let chosen = null;
if (opt('harness')) chosen = opt('harness').split(',').map((s) => s.trim()).filter(Boolean);
if (flag('all')) chosen = HARNESSES.map((h) => h.id);

if (!chosen || !scope) {
  log('\n=== unofficial-instagram-mcp installer ===');
  log('Installs the "instagram" MCP server and the Agent Skill into your agent harness.\n');
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (!scope) {
    if (interactive) {
      const idx = await picker({
        title: 'Where should it be installed?',
        hint: 'Use arrow keys, press enter to confirm.',
        items: ['User (all projects)', 'This project only'],
        multi: false,
      });
      scope = idx === 1 ? 'project' : 'user';
    } else {
      scope = await askNumberedScope();
    }
  }
  if (!chosen) {
    if (interactive) {
      const idxs = await picker({
        title: 'Which harnesses?',
        hint: 'Arrow keys to move, space to toggle, a to toggle all, enter to confirm.',
        items: HARNESSES.map((h) => h.label),
        multi: true,
      });
      chosen = idxs.map((i) => HARNESSES[i].id);
    } else {
      chosen = await askNumberedHarnesses();
    }
  }
}
scope = scope === 'project' ? 'project' : 'user';
if (!chosen?.length) { console.error('No harness selected. Aborted.'); process.exit(1); }

log(`\nScope: ${scope}${dryRun ? ' (dry-run)' : ''}`);
for (const id of chosen) {
  const h = HARNESSES.find((x) => x.id === id);
  if (!h) { console.error(`Unknown harness: ${id} (see --list)`); continue; }
  log(`\n${h.label}:`);
  if (!flag('skill-only')) installMcp(h, scope);
  if (!flag('mcp-only')) installSkill(h, scope);
}
log('\nDone. Restart your harness, then ask the agent to call ig_status.');
log('Remember: Chrome must be running with --remote-debugging-port=9222 and signed in to Instagram.');
