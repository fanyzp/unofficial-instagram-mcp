import { spawn } from 'node:child_process';
import assert from 'node:assert';

// Test protokol MCP TANPA browser: initialize + tools/list + ping + method tak dikenal.
const srv = spawn('node', ['src/server.js'], { stdio: ['pipe', 'pipe', 'ignore'] });
let buf = '';
const answers = new Map();
srv.stdout.on('data', (d) => {
  buf += d;
  for (const line of buf.split('\n')) {
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.id !== undefined) answers.set(m.id, m); } catch {}
  }
  buf = buf.slice(buf.lastIndexOf('\n') + 1);
});
const send = (o) => srv.stdin.write(JSON.stringify(o) + '\n');
const waitFor = async (id) => { for (let i = 0; i < 50 && !answers.has(id); i++) await new Promise((r) => setTimeout(r, 100)); return answers.get(id); };

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
send({ jsonrpc: '2.0', id: 3, method: 'ping' });
send({ jsonrpc: '2.0', id: 4, method: 'tidak/ada' });
send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'ig_status', arguments: {} } });
send({ jsonrpc: '2.0', id: 6, method: 'ping' });
send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'ig_selftest', arguments: { level: 'full' } } });

const init = await waitFor(1);
assert.equal(init.result.serverInfo.name, 'unofficial-instagram-mcp'); console.log('initialize OK');
const list = await waitFor(2);
const names = list.result.tools.map((t) => t.name);
for (const need of ['ig_status', 'dm_list_threads', 'dm_check', 'dm_read_thread', 'dm_send', 'dm_send_to_user', 'profile_get', 'search', 'post_like', 'post_comment', 'post_reply_to_comment', 'post_create', 'user_posts', 'post_get', 'post_comments', 'feed_home', 'explore_posts', 'hashtag_posts', 'media_urls', 'user_follow', 'user_unfollow', 'followers_list', 'following_list', 'comment_like', 'post_save', 'notifications_list', 'story_view', 'story_reply', 'post_delete', 'stories_tray', 'story_create', 'story_create_poll', 'story_delete', 'ig_selftest'])
  assert.ok(names.includes(need), `tool hilang: ${need}`);
console.log(`tools/list OK (${names.length} tools):`, names.join(', '));
assert.equal(list.result.tools.find((t) => t.name === 'ig_status').annotations.readOnlyHint, true);
assert.equal(list.result.tools.find((t) => t.name === 'dm_send').annotations.destructiveHint, true);
console.log('annotations OK (readOnly vs destructive)');
assert.ok((await waitFor(1)).result.instructions.includes('ig_status')); console.log('server instructions OK');
assert.ok((await waitFor(3)).result !== undefined); console.log('ping OK');
assert.equal((await waitFor(4)).error.code, -32601); console.log('unknown method OK');
// tools/call tanpa browser CDP: harus balik isError yang rapi, BUKAN crash; server tetap hidup (ping id 6).
const call = await waitFor(5);
assert.equal(call.result.isError, true); assert.match(call.result.content[0].text, /Error:/);
console.log('tools/call graceful-error OK:', call.result.content[0].text.slice(0, 90));
assert.ok((await waitFor(6)).result !== undefined); console.log('server tetap hidup setelah error OK');
// Self-test full TANPA gerbang env harus MENOLAK dengan rapi (bukan error, bukan jalan diam-diam).
const stFull = await waitFor(7);
const stText = stFull.result.content[0].text;
assert.ok(stText.includes('"refused"'), 'selftest full harus menolak tanpa gerbang');
assert.ok(stText.includes('akun kedua'), 'penolakan harus memuat peringatan akun kedua');
console.log('selftest full gate OK:', stText.replace(/\s+/g, ' ').slice(0, 120));
srv.kill();
console.log('\nSEMUA TEST MCP LULUS');
