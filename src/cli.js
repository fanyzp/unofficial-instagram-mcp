#!/usr/bin/env node
import { findTool, TOOLS, CATEGORIES } from './tools.js';

// CLI: jembatan manusia ke tool yang sama persis dengan yang dipakai AI agent via MCP.
//   node src/cli.js tools
//   node src/cli.js ig_status
//   node src/cli.js dm_list_threads --limit 5
//   node src/cli.js dm_read_thread --threadId 1784...
//   node src/cli.js dm_send --threadId 1784... --text "halo!"
//   node src/cli.js profile_get --username fanyzts
//   node src/cli.js search --query "balikpapan"
//   node src/cli.js post_like --url https://www.instagram.com/p/....
//   node src/cli.js post_create --files ./a.jpg,./b.jpg --caption "halo"
const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { const k = rest[i].slice(2); const v = rest[i + 1]; args[k] = v && !v.startsWith('--') ? (i++, isNaN(Number(v)) ? v : Number(v)) : true; }
}
if (args.files && typeof args.files === 'string') args.files = args.files.split(',');

if (!cmd || cmd === 'tools' || cmd === '--help') {
  console.log('unofficial-instagram-mcp - CLI\n');
  for (const [cat, names] of CATEGORIES) {
    console.log(`${cat}:`);
    for (const t of TOOLS.filter((x) => names.includes(x.name))) console.log(`  ${t.name.padEnd(22)} ${t.description}`);
    console.log('');
  }
  console.log('watch                 Pantau DM baru terus-menerus; setiap event dicetak 1 baris JSON (Ctrl+C berhenti). Opsi: --intervalSec 60');
  console.log('');
  console.log('Pakai: node src/cli.js <tool> --argumen nilai');
  process.exit(0);
}
if (cmd === 'watch') {
  const { getWatcher } = await import('./watcher.js');
  const w = getWatcher((event) => console.log(JSON.stringify(event)));
  if (args.intervalSec) w.intervalMs = Math.max(15, Number(args.intervalSec)) * 1000;
  const st = await w.start();
  console.log(JSON.stringify({ watcher: st }));
  const keepAlive = setInterval(() => {}, 30000);
  process.on('SIGINT', () => { w.stop(); clearInterval(keepAlive); process.exit(0); });
  await new Promise(() => {});
}
const tool = findTool(cmd);
if (!tool) { console.error(`Tool tidak dikenal: ${cmd}`); process.exit(1); }
try {
  const out = await tool.run(args);
  console.log(JSON.stringify(out, null, 2));
} catch (e) { console.error('Error:', e.message); process.exit(1); }
