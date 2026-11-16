#!/usr/bin/env node
// Official installer for unofficial-instagram-mcp: installs the MCP server and
// the Agent Skill into the agent harnesses (clients) the user picks, in one flow.
//   node bin/install.mjs                      -> interactive (arrow key pickers)
//   node bin/install.mjs --harness claude-code,opencode --scope user
//   node bin/install.mjs --all --scope project --dry-run
// No dependencies. Existing config files are merged, never replaced wholesale.
//
// Harness config formats, checked against each project's documentation:
//   mcpServers  Claude Code, Cursor, Gemini CLI, Pi, Oh My Pi, Windsurf,
//               Claude Desktop, VS Code (Copilot layout, VS Code 1.146+)
//   opencode    OpenCode JSON "mcp" with { type: "local", command: [..] }
//   codex       Codex TOML [mcp_servers.instagram]
//   nested      OpenClaw and ZCode: JSON under mcp.servers
//   amp         Amp settings.json under the literal key "amp.mcpServers"
//   zed         Zed "context_servers" with a nested command object
//   goose       Goose config.yaml "extensions" (YAML, edited conservatively)
// OpenClaw (JSON5), Amp and Zed (JSONC) config files may contain comments:
// if such a file does not parse as strict JSON, the installer prints the
// entry to paste by hand instead of rewriting the file without its comments.
// T3 Code has no MCP config of its own: it runs other providers (Claude
// Code, Codex) and reads their configs, so install into one of those.
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { homedir, platform } from 'node:os';
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

const osPick = ({ darwin, win32, linux }) => (platform() === 'darwin' ? darwin : platform() === 'win32' ? win32 : linux);

// mcp / skill are null where a harness has no such install target.
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
  { id: 'pi', label: 'Pi', format: 'mcpServers',
    mcp: { user: join(HOME, '.pi', 'agent', 'mcp.json'), project: join(CWD, '.pi', 'mcp.json') },
    skill: { user: join(HOME, '.pi', 'agent', 'skills'), project: join(CWD, '.pi', 'skills') } },
  { id: 'oh-my-pi', label: 'Oh My Pi (omp)', format: 'mcpServers',
    mcp: { user: join(HOME, '.omp', 'agent', 'mcp.json'), project: join(CWD, '.omp', 'mcp.json') },
    skill: { user: join(HOME, '.omp', 'agent', 'skills'), project: join(CWD, '.omp', 'skills') } },
  { id: 'openclaw', label: 'OpenClaw', format: 'nested', loose: true,
    mcp: { user: join(HOME, '.openclaw', 'openclaw.json'), project: null },
    mcpNote: 'OpenClaw uses one gateway config, so there is no project-scope MCP file.',
    skill: { user: join(HOME, '.openclaw', 'skills'), project: join(CWD, 'skills') } },
  { id: 'zcode', label: 'ZCode', format: 'nested',
    mcp: { user: join(HOME, '.zcode', 'cli', 'config.json'), project: join(CWD, '.zcode', 'config.json') },
    skill: null, skillNote: 'ZCode ships skills as plugins, so only the MCP server is installed.' },
  { id: 'goose', label: 'Goose', format: 'goose',
    mcp: { user: osPick({
      darwin: join(HOME, '.config', 'goose', 'config.yaml'),
      win32: join(HOME, 'AppData', 'Roaming', 'Block', 'goose', 'config', 'config.yaml'),
      linux: join(HOME, '.config', 'goose', 'config.yaml'),
    }), project: null },
    mcpNote: 'Goose keeps extensions in its user config, so there is no project-scope MCP file.',
    skill: { user: join(HOME, '.agents', 'skills'), project: join(CWD, '.agents', 'skills') } },
  { id: 'amp', label: 'Amp', format: 'amp', loose: true,
    mcp: { user: join(HOME, '.config', 'amp', 'settings.json'), project: join(CWD, '.amp', 'settings.json') },
    skill: { user: join(HOME, '.config', 'amp', 'skills'), project: join(CWD, '.agents', 'skills') } },
  { id: 'vscode', label: 'VS Code (Copilot)', format: 'mcpServers',
    mcp: { user: join(HOME, '.copilot', 'mcp-config.json'), project: join(CWD, '.mcp.json') },
    skill: { user: join(HOME, '.copilot', 'skills'), project: join(CWD, '.github', 'skills') } },
  { id: 'claude-desktop', label: 'Claude Desktop', format: 'mcpServers',
    mcp: { user: osPick({
      darwin: join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      win32: join(HOME, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
      linux: join(HOME, '.config', 'Claude', 'claude_desktop_config.json'),
    }), project: null },
    mcpNote: 'Claude Desktop has no project scope.',
    skill: null, skillNote: 'Claude Desktop does not load SKILL.md folders from disk, so only the MCP server is installed.' },
  { id: 'windsurf', label: 'Windsurf', format: 'mcpServers',
    mcp: { user: join(HOME, '.codeium', 'windsurf', 'mcp_config.json'), project: null },
    mcpNote: 'Windsurf (Cascade) uses one global MCP file for every workspace.',
    skill: null, skillNote: 'Windsurf does not load SKILL.md skill folders, so only the MCP server is installed.' },
  { id: 'zed', label: 'Zed', format: 'zed', loose: true,
    mcp: { user: osPick({
      darwin: join(HOME, '.config', 'zed', 'settings.json'),
      win32: join(HOME, 'AppData', 'Roaming', 'Zed', 'settings.json'),
      linux: join(HOME, '.config', 'zed', 'settings.json'),
    }), project: join(CWD, '.zed', 'settings.json') },
    skill: null, skillNote: 'Zed does not load SKILL.md skill folders, so only the MCP server is installed.' },
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
  for (const h of HARNESSES) log(`${h.id.padEnd(16)} ${h.label}`);
  process.exit(0);
}

function readJson(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`Config file is not valid JSON: ${path}`); }
}
// For JSON5/JSONC files (loose harnesses): returns null when the file has
// content that strict JSON cannot parse, so the caller prints the entry
// instead of rewriting the file and dropping its comments.
function readJsonLoose(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return null; }
}
function writeFile(path, content) {
  if (dryRun) { plan(`write ${path}`); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  log(`  written: ${path}`);
}

const cmdAndArgs = () => (VIA_NPX ? { command: 'npx', args: NPX_ARGS } : { command: 'node', args: [SERVER] });

function entryFor(format) {
  const { command, args: cmdArgs } = cmdAndArgs();
  if (format === 'opencode') return { type: 'local', command: [command, ...cmdArgs], enabled: true, environment: MCP_ENV };
  if (format === 'zed') return { source: 'custom', command: { path: command, args: cmdArgs, env: MCP_ENV } };
  return { command, args: cmdArgs, env: MCP_ENV };
}

function snippetFor(h) {
  if (h.format === 'codex') {
    const { command, args: cmdArgs } = cmdAndArgs();
    const argList = cmdArgs.map((a) => `"${a.replace(/\\/g, '\\\\')}"`).join(', ');
    return `[mcp_servers.instagram]\ncommand = "${command}"\nargs = [${argList}]\n\n[mcp_servers.instagram.env]\nCDP_URL = "${MCP_ENV.CDP_URL}"\nIG_DRY_RUN = "${MCP_ENV.IG_DRY_RUN}"`;
  }
  if (h.format === 'goose') return `extensions:\n${gooseBlock()}`;
  const entry = entryFor(h.format);
  if (h.format === 'nested') return JSON.stringify({ mcp: { servers: { instagram: entry } } }, null, 2);
  if (h.format === 'amp') return JSON.stringify({ 'amp.mcpServers': { instagram: entry } }, null, 2);
  if (h.format === 'zed') return JSON.stringify({ context_servers: { instagram: entry } }, null, 2);
  if (h.format === 'opencode') return JSON.stringify({ mcp: { instagram: entry } }, null, 2);
  return JSON.stringify({ mcpServers: { instagram: entry } }, null, 2);
}

function printManual(h, path, why) {
  log(`  MCP: ${path} ${why}; nothing was changed. Add this entry by hand:`);
  for (const line of snippetFor(h).split('\n')) log(`    ${line}`);
}

function gooseBlock() {
  const { command, args: cmdArgs } = cmdAndArgs();
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return [
    '  instagram:',
    '    enabled: true',
    '    type: stdio',
    '    name: instagram',
    `    cmd: ${command}`,
    `    args: [${cmdArgs.map(q).join(', ')}]`,
    '    envs:',
    ...Object.entries(MCP_ENV).map(([k, v]) => `      ${k}: ${q(v)}`),
    '    timeout: 300',
  ].join('\n');
}

function installGoose(h, path) {
  if (!existsSync(path)) {
    writeFile(path, `extensions:\n${gooseBlock()}\n`);
    return;
  }
  const text = readFileSync(path, 'utf8');
  if (/^\s*instagram\s*:/m.test(text)) { log(`  MCP: already registered in ${path}, skipped`); return; }
  if (/^extensions\s*:\s*\{/m.test(text)) { printManual(h, path, 'uses a flow-style extensions map'); return; }
  if (/^extensions\s*:\s*$/m.test(text)) {
    writeFile(path, text.replace(/^extensions\s*:\s*$/m, (m) => `${m}\n${gooseBlock()}`));
    return;
  }
  if (/^extensions\s*:/m.test(text)) { printManual(h, path, 'has an extensions section in a shape the installer will not rewrite'); return; }
  writeFile(path, `${text.replace(/\s*$/, '')}\n\nextensions:\n${gooseBlock()}\n`);
}

function installMcp(h, scope) {
  if (!h.mcp) { log('  MCP: skipped (this harness is skill only; register the server manually, see the README)'); return; }
  const path = h.mcp[scope];
  if (!path) {
    log(`  MCP: skipped for ${scope} scope. ${h.mcpNote || ''}`);
    return;
  }
  if (h.format === 'goose') { installGoose(h, path); return; }
  if (h.format === 'codex') {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur.includes('[mcp_servers.instagram]')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    writeFile(path, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + snippetFor(h) + '\n');
    return;
  }
  const cfg = h.loose ? readJsonLoose(path) : readJson(path);
  if (cfg === null) { printManual(h, path, 'is not strict JSON (it may contain comments)'); return; }
  const entry = entryFor(h.format);
  if (h.format === 'opencode') {
    cfg.mcp = cfg.mcp || {};
    if (cfg.mcp.instagram && !flag('force')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    cfg.mcp.instagram = entry;
  } else if (h.format === 'nested') {
    cfg.mcp = cfg.mcp || {};
    cfg.mcp.servers = cfg.mcp.servers || {};
    if (cfg.mcp.servers.instagram && !flag('force')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    cfg.mcp.servers.instagram = entry;
  } else if (h.format === 'amp') {
    cfg['amp.mcpServers'] = cfg['amp.mcpServers'] || {};
    if (cfg['amp.mcpServers'].instagram && !flag('force')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    cfg['amp.mcpServers'].instagram = entry;
  } else if (h.format === 'zed') {
    cfg.context_servers = cfg.context_servers || {};
    if (cfg.context_servers.instagram && !flag('force')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    cfg.context_servers.instagram = entry;
  } else {
    cfg.mcpServers = cfg.mcpServers || {};
    if (cfg.mcpServers.instagram && !flag('force')) { log(`  MCP: already registered in ${path}, skipped`); return; }
    cfg.mcpServers.instagram = entry;
  }
  writeFile(path, JSON.stringify(cfg, null, 2) + '\n');
}

function installSkill(h, scope) {
  if (!h.skill) { log(`  Skill: skipped. ${h.skillNote || ''}`); return; }
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
