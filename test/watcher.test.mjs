// Tes watcher DM (src/watcher.js) dengan snapshot/verify suntikan: tanpa
// browser, tanpa jaringan. Membuktikan aturan mainnya: baseline tidak
// melaporkan pesan lama, pesan baru terverifikasi jadi tepat satu event,
// dedupe bekerja, flag spam terpasang, dan state signed_out dilaporkan.
import assert from 'node:assert';
import { DmWatcher, isLikelySpam } from '../src/watcher.js';

// --- isLikelySpam ---
assert.equal(isLikelySpam('https://example.com'), true);
assert.equal(isLikelySpam('casino.example.com'), true);
assert.equal(isLikelySpam('menang giveaway sekarang, klaim ya'), true);
assert.equal(isLikelySpam('halo, apa kabar?'), false);
assert.equal(isLikelySpam('besok jadi ketemu jam 7?'), false);
assert.equal(isLikelySpam(''), false);
console.log('OK isLikelySpam');

// --- Alur utama: baseline -> pesan baru -> dedupe -> spam ---
let snapRows = [{ key: '111', name: 'Lama', preview: 'pesan lama', unread: true }];
let verifyThreads = [{ threadId: '111', username: 'lama', name: 'Lama', lastMessage: 'pesan lama', lastMessageFromMe: false }];
const emitted = [];
const w = new DmWatcher({
  snapshot: async () => ({ signedIn: true, signedInUser: 'b3lla.28_', rows: snapRows }),
  verify: async () => ({ needsReply: verifyThreads }),
  onEvent: (e) => emitted.push(e),
  intervalMs: 15000,
  verifyCooldownMs: 0,
});
const st0 = await w.start();
assert.equal(st0.running, true);
assert.equal(st0.baselineDone, true);
assert.equal(emitted.filter((e) => e.type === 'dm_new_message').length, 0, 'baseline tidak boleh melaporkan pesan lama');
assert.equal(emitted.filter((e) => e.type === 'watcher_state' && e.state === 'baseline').length, 1);
console.log('OK baseline: pesan lama tidak dilaporkan');

snapRows = [{ key: '222', name: 'Fany', preview: 'halo tes', unread: true }, ...snapRows];
verifyThreads = [{ threadId: '222', username: 'fanyzts', name: 'Fany', lastMessage: 'halo tes', lastMessageFromMe: false }, ...verifyThreads];
await w._poll();
const news1 = emitted.filter((e) => e.type === 'dm_new_message');
assert.equal(news1.length, 1);
assert.equal(news1[0].threadId, '222');
assert.equal(news1[0].username, 'fanyzts');
assert.equal(news1[0].text, 'halo tes');
assert.equal(news1[0].spam, false);
console.log('OK pesan baru terverifikasi -> tepat 1 event dm_new_message');

await w._poll();
await w._poll();
assert.equal(emitted.filter((e) => e.type === 'dm_new_message').length, 1, 'event yang sama tidak boleh dobel');
console.log('OK dedupe: poll berulang tidak mengulang event');

snapRows = [{ key: '333', name: 'Promo', preview: 'casino.example.com', unread: true }, ...snapRows];
verifyThreads = [{ threadId: '333', username: 'promo', name: 'Promo', lastMessage: 'casino.example.com', lastMessageFromMe: false }, ...verifyThreads];
await w._poll();
const news2 = emitted.filter((e) => e.type === 'dm_new_message');
assert.equal(news2.length, 2);
assert.equal(news2[1].spam, true);
console.log('OK flag spam terpasang pada pesan promo/link');

// --- eventsSince / cursor ---
const all = w.eventsSince(0);
assert.equal(all.total, emitted.length);
assert.ok(all.cursor > 0);
assert.equal(w.eventsSince(all.cursor).events.length, 0);
console.log('OK dm_events cursor: tidak ada event setelah cursor terakhir');

const stStop = w.stop();
assert.equal(stStop.running, false);
console.log('OK stop');

// --- Belum login: state signed_out, tanpa event pesan ---
const emitted2 = [];
const w2 = new DmWatcher({
  snapshot: async () => ({ signedIn: false, signedInUser: null, rows: [] }),
  verify: async () => ({ needsReply: [] }),
  onEvent: (e) => emitted2.push(e),
  intervalMs: 15000,
});
const st2 = await w2.start();
assert.equal(st2.state, 'signed_out');
assert.equal(emitted2.filter((e) => e.type === 'dm_new_message').length, 0);
assert.equal(emitted2.filter((e) => e.state === 'signed_out').length, 1);
await w2._poll();
assert.equal(emitted2.filter((e) => e.state === 'signed_out').length, 1, 'state yang sama tidak di-spam berulang');
w2.stop();
console.log('OK signed_out dilaporkan sekali');

console.log('WATCHER-TESTS-OK');
