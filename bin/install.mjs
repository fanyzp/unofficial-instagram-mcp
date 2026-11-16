#!/usr/bin/env node
// Installer resmi unofficial-instagram-mcp: memasang MCP server + Agent Skill
// ke harness (agent client) pilihan user, dalam satu alur.
//   node bin/install.mjs                      -> mode interaktif (pilih harness)
//   node bin/install.mjs --harness claude-code,opencode --scope user --yes
//   node bin/install.mjs --all --scope project --dry-run
// Tanpa dependensi. Config yang sudah ada digabung (merge), tidak ditimpa total.
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
// Saat installer jalan lewat npx, path lokal menunjuk ke cache npx yang bisa dibersihkan.
// Dalam mode itu config ditulis memakai perintah npx agar tetap valid seterusnya.
const VIA_NPX = ROOT.split(/[\\/]/).includes('_npx');
const NPX_ARGS = ['-y', 'github:fanyzp/unofficial-instagram-mcp'];

// format: 'mcpServers' (JSON umum) | 'opencode' (JSON key mcp) | 'codex' (TOML) | null (skill saja)
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
  { id: 'generic', label: 'Generic (.agents/skills, skill saja)', format: null,
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
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`File config bukan JSON valid: ${path}`); }
}
function writeFile(path, content) {
  if (dryRun) { plan(`tulis ${path}`); return; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  log(`  ditulis: ${path}`);
}

function installMcp(h, scope) {
  if (!h.mcp) { log('  MCP: dilewati (harness ini hanya skill; daftarkan server manual dari README)'); return; }
  const path = h.mcp[scope];
  if (h.format === 'codex') {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur.includes('[mcp_servers.instagram]')) { log(`  MCP: sudah terdaftar di ${path}, dilewati`); return; }
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
  if (existsSync(dest) && !flag('force')) { log(`  Skill: sudah ada di ${dest}, dilewati (pakai --force untuk menimpa)`); return; }
  if (dryRun) { plan(`salin skill -> ${dest}`); return; }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(SKILL_SRC, dest, { recursive: true });
  log(`  Skill: terpasang di ${dest}`);
}

let scope = opt('scope');
let chosen = null;
if (opt('harness')) chosen = opt('harness').split(',').map((s) => s.trim()).filter(Boolean);
if (flag('all')) chosen = HARNESSES.map((h) => h.id);

if (!chosen || !scope) {
  // Antrian baris sendiri: tetap bekerja di terminal interaktif maupun stdin pipa.
  const rl = createInterface({ input: process.stdin });
  const queued = []; const waiters = [];
  rl.on('line', (l) => { if (waiters.length) waiters.shift()(l); else queued.push(l); });
  rl.on('close', () => { while (waiters.length) waiters.shift()(null); });
  const ask = (q) => {
    process.stdout.write(q);
    if (queued.length) return Promise.resolve(queued.shift());
    return new Promise((res) => waiters.push(res));
  };
  log('\n=== unofficial-instagram-mcp - installer ===');
  log('Memasang MCP server "instagram" + Agent Skill ke harness pilihanmu.\n');
  if (!scope) {
    const s = ((await ask('Scope? [1] User (semua project)  [2] Project ini saja (default 1): ')) || '').trim();
    scope = s === '2' ? 'project' : 'user';
  }
  if (!chosen) {
    log('\nHarness:');
    HARNESSES.forEach((h, i) => log(` ${i + 1}. ${h.label}`));
    const pick = ((await ask('\nPilih (pisah koma, contoh 1,2): ')) || '').trim();
    chosen = pick.split(',').map((x) => HARNESSES[Number(x.trim()) - 1]?.id).filter(Boolean);
  }
  rl.close();
}
scope = scope === 'project' ? 'project' : 'user';
if (!chosen?.length) { console.error('Tidak ada harness yang dipilih. Batal.'); process.exit(1); }

log(`\nScope: ${scope}${dryRun ? ' (dry-run)' : ''}`);
for (const id of chosen) {
  const h = HARNESSES.find((x) => x.id === id);
  if (!h) { console.error(`Harness tidak dikenal: ${id} (lihat --list)`); continue; }
  log(`\n${h.label}:`);
  if (!flag('skill-only')) installMcp(h, scope);
  if (!flag('mcp-only')) installSkill(h, scope);
}
log('\nSelesai. Restart harness, lalu minta agent memanggil ig_status.');
log('Ingat: Chrome harus jalan dengan --remote-debugging-port=9222 dan sudah login Instagram.');
