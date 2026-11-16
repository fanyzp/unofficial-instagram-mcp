#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { findTool, CATEGORIES } from './tools.js';
import { env } from './config.js';

// TUI tanpa dependensi: menu utama = kategori (prefix tool), tiap kategori membuka
// sub-menu tool. TUI ini cara paling langsung untuk mengetes tiap tool dengan tangan:
// ia menjalankan tool yang sama persis dengan MCP dan CLI, ke sesi live, dan mencetak
// hasil mentahnya.
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => rl.question(q);
const askUrl = () => ask('URL post: ');
const askUser = () => ask('Username: ');

const PROMPTS = {
  ig_status: () => ({}),
  ig_selftest: async () => ({ level: ((await ask('Level (safe/full, default safe): ')).trim() || 'safe') }),
  dm_list_threads: async () => ({ limit: Number(await ask('Berapa thread? (default 7): ')) || 7 }),
  dm_check: async () => ({ limit: Number(await ask('Berapa thread? (default 7): ')) || 7 }),
  dm_read_thread: async () => ({ threadId: await ask('threadId: '), limit: 20 }),
  dm_send: async () => ({ threadId: await ask('threadId: '), text: await ask('Pesan: ') }),
  dm_send_to_user: async () => ({ username: await askUser(), text: await ask('Pesan: ') }),
  profile_get: async () => { const u = await ask('Username (kosong = profil sendiri): '); return u ? { username: u } : {}; },
  search: async () => ({ query: await ask('Query: ') }),
  post_create: async () => ({ files: (await ask('Path gambar (pisah koma): ')).split(',').map((s) => s.trim()), caption: await ask('Caption: ') }),
  post_get: async () => ({ url: await askUrl() }),
  post_like: async () => ({ url: await askUrl() }),
  post_comment: async () => ({ url: await askUrl(), text: await ask('Komentar: ') }),
  post_reply_to_comment: async () => ({ url: await askUrl(), match: await ask('Komentar memuat teks: '), text: await ask('Balasan: ') }),
  comment_like: async () => ({ url: await askUrl(), match: await ask('Komentar memuat teks: ') }),
  post_save: async () => ({ url: await askUrl() }),
  post_delete: async () => ({ url: await askUrl() }),
  user_posts: async () => ({ username: await askUser(), limit: 12 }),
  post_comments: async () => ({ url: await askUrl(), limit: 20 }),
  media_urls: async () => ({ url: await askUrl() }),
  feed_home: async () => ({ limit: 10 }),
  explore_posts: async () => ({ limit: 15 }),
  hashtag_posts: async () => ({ tag: await ask('Hashtag (tanpa #): '), limit: 15 }),
  user_follow: async () => ({ username: await askUser() }),
  user_unfollow: async () => ({ username: await askUser() }),
  followers_list: async () => ({ username: await askUser(), limit: 30 }),
  following_list: async () => ({ username: await askUser(), limit: 30 }),
  notifications_list: async () => ({ limit: 20 }),
  stories_tray: async () => ({ limit: 20 }),
  story_view: async () => ({ username: await askUser() }),
  story_reply: async () => ({ username: await askUser(), text: await ask('Balasan story: ') }),
  story_create: async () => {
    const file = await ask('Path gambar (kosong = story teks): ');
    if (file.trim()) return { file: file.trim() };
    return { text: await ask('Teks story: ') };
  },
  story_create_poll: async () => ({
    file: (await ask('Path gambar: ')).trim(),
    question: await ask('Pertanyaan polling: '),
    options: [(await ask('Pilihan 1 (default Yes): ')).trim() || 'Yes', (await ask('Pilihan 2 (default No): ')).trim() || 'No'],
  }),
  story_delete: () => ({}),
};

console.log('\n=== unofficial-instagram-mcp - TUI ===');
console.log(`Mode: ${env.dryRun ? 'DRY_RUN (aksi tulis hanya simulasi)' : 'LIVE (aksi tulis beneran)'}`);

let done = false;
while (!done) {
  console.log('\nKategori:');
  CATEGORIES.forEach(([cat], i) => console.log(` ${i + 1}. ${cat}`));
  console.log(' 0. Keluar');
  const pick = (await ask('\nPilih kategori: ')).trim();
  if (pick === '0') break;
  const cat = CATEGORIES[Number(pick) - 1];
  if (!cat) { console.log('Pilihan tidak dikenal.'); continue; }
  for (;;) {
    console.log(`\n--- ${cat[0]} ---`);
    cat[1].forEach((name, i) => console.log(` ${i + 1}. ${name}`));
    console.log(' 0. Kembali');
    const sub = (await ask('\nPilih tool: ')).trim();
    if (sub === '0') break;
    const name = cat[1][Number(sub) - 1];
    if (!name || !PROMPTS[name]) { console.log('Pilihan tidak dikenal.'); continue; }
    try {
      const args = await PROMPTS[name]();
      const out = await findTool(name).run(args);
      console.log('\n' + JSON.stringify(out, null, 2));
    } catch (e) { console.log(`\nError: ${e.message}`); }
  }
}
rl.close();
