import { createInterface } from 'node:readline';
import { toolList, findTool } from './tools.js';
import { runSelfTest, SELFTEST_WARNING } from './selftest.js';
import { env } from './config.js';

// MCP server TANPA SDK: JSON-RPC 2.0 per baris di stdio (newline-delimited),
// sesuai spek MCP stdio transport. Ringan: satu-satunya dependensi project = playwright-core.
const SERVER = { name: 'unofficial-instagram-mcp', version: '0.2.0' };
const PROTOCOL = '2024-11-05';

// Self-test otomatis SEKALI saat koneksi pertama, hanya bila IG_SELFTEST_ON_CONNECT=true.
// Level yang jalan otomatis selalu "safe" (baca saja). Hasil ditulis ke stderr, bukan protokol.
let selftestStarted = false;
function maybeAutoSelfTest() {
  if (selftestStarted || !env.selftestOnConnect) return;
  selftestStarted = true;
  console.error('[selftest] IG_SELFTEST_ON_CONNECT=true: menjalankan self-test level safe...');
  console.error(`[selftest] ${SELFTEST_WARNING}`);
  runSelfTest({ level: 'safe' })
    .then((r) => console.error(`[selftest] selesai: ${r.passed ?? 0} lulus, ${r.failed ?? 0} gagal. Detail: panggil tool ig_selftest.`))
    .catch((e) => console.error(`[selftest] gagal jalan: ${e.message}`));
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const replyError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notification -> tidak dibalas
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions: 'Server ini mengendalikan Instagram Web lewat browser pemilik akun yang SUDAH login (bukan API Meta). Mulai dari ig_status. Tool baca aman dipanggil kapan saja; dm_list_threads/dm_check membuka thread dan bisa menandainya terbaca. Tool tulis (dm_send, post_like, post_comment, post_reply_to_comment, post_create, story_create, story_create_poll) berdampak nyata kecuali server berjalan dengan IG_DRY_RUN=true - hasil tool selalu menyatakan dryRun/sent apa adanya, percayai hasil itu. Jangan memanggil tool tulis berulang untuk pesan yang sama. Tool ig_selftest menjalankan pemeriksaan resmi: level safe hanya membaca; level full menguji semua fungsi tulis lalu menghapus konten tesnya sendiri, dan hanya boleh dijalankan di akun kedua.',
      });
      maybeAutoSelfTest();
    } else if (method === 'ping') {
      reply(id, {});
    } else if (method === 'tools/list') {
      reply(id, { tools: toolList() });
    } else if (method === 'tools/call') {
      const tool = findTool(params?.name);
      if (!tool) return replyError(id, -32602, `Tool tidak dikenal: ${params?.name}`);
      try {
        const result = await tool.run(params.arguments || {});
        reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        reply(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    } else {
      replyError(id, -32601, `Method tidak didukung: ${method}`);
    }
  } catch (e) { replyError(id, -32603, e.message); }
}

console.error(`${SERVER.name} v${SERVER.version} - MCP stdio siap (stderr ini aman, bukan output protokol)`);
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  try { handle(JSON.parse(t)); } catch { /* baris bukan JSON: abaikan */ }
});
