import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ig from './instagram.js';
import { env } from './config.js';

// SELF-TEST resmi project ini. Dua level:
// - "safe": hanya tool BACA. Aman di akun mana pun, jalan otomatis saat koneksi pertama
//   bila IG_SELFTEST_ON_CONNECT=true.
// - "full": menguji SEMUA tool tulis pada konten buatan sendiri, lalu MENGHAPUS semuanya
//   di akhir (post tes dihapus, story tes dihapus, follow dikembalikan ke state awal).
//   GERBANG KERAS: hanya jalan bila IG_SELFTEST_FULL=true, IG_DRY_RUN=false, dan
//   IG_SELFTEST_ACCOUNT sama persis dengan username yang sedang login.
// PERINGATAN: jalankan level full HANYA di akun kedua (second account), jangan akun utama.
export const SELFTEST_WARNING = 'Jalankan self-test level full HANYA di akun kedua (second account). Level full menguji semua fungsi tulis pada konten buatan sendiri dan menghapus semuanya di akhir, tetapi akun utama tidak perlu menanggung risiko dan riwayat aktivitasnya.';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'test-post.png');
const MARK = 'mcp selftest';

async function step(results, tool, fn, check) {
  try {
    const out = await fn();
    const ok = check ? check(out) : true;
    results.push({ tool, ok, detail: summarize(out) });
    return out;
  } catch (e) {
    results.push({ tool, ok: false, detail: `Error: ${e.message}` });
    return null;
  }
}
const summarize = (o) => JSON.stringify(o ?? {}).slice(0, 220);

export async function runSelfTest({ level = 'safe' } = {}) {
  const results = [];
  if (level === 'full') {
    if (!env.selftestFull) return { ran: false, level, refused: 'IG_SELFTEST_FULL belum true di .env.', warning: SELFTEST_WARNING };
    if (env.dryRun) return { ran: false, level, refused: 'IG_DRY_RUN masih true; self-test full butuh aksi tulis beneran. Set IG_DRY_RUN=false khusus sesi tes ini.', warning: SELFTEST_WARNING };
    if (!env.selftestAccount) return { ran: false, level, refused: 'IG_SELFTEST_ACCOUNT belum diisi; isi username akun kedua yang dipakai tes.', warning: SELFTEST_WARNING };
    if (!existsSync(FIXTURE)) return { ran: false, level, refused: `Fixture gambar tes tidak ada: ${FIXTURE}` };
  }

  const st = await step(results, 'ig_status', () => ig.status(), (o) => Boolean(o?.signedInUser));
  const me = st?.signedInUser;
  if (!me) return { ran: true, level, passed: 0, failed: results.length, results, note: 'Tidak login / status gagal; self-test berhenti.' };
  if (level === 'full' && me !== env.selftestAccount)
    return { ran: false, level, refused: `Akun login @${me} tidak sama dengan IG_SELFTEST_ACCOUNT @${env.selftestAccount}. Self-test full dibatalkan demi keamanan.`, warning: SELFTEST_WARNING };

  // --- Baca (kedua level) ---
  await step(results, 'profile_get', () => ig.profileGet({ username: me }), (o) => Boolean(o?.headerText || o?.counts));
  await step(results, 'feed_home', () => ig.feedHome({ limit: 3 }));
  const explore = await step(results, 'explore_posts', () => ig.explorePosts({ limit: 3 }), (o) => o.count > 0);
  await step(results, 'hashtag_posts', () => ig.hashtagPosts({ tag: 'photography', limit: 3 }), (o) => o.count > 0);
  await step(results, 'search', () => ig.search({ query: 'instagram', limit: 3 }));
  await step(results, 'stories_tray', () => ig.storiesTray({ limit: 5 }));
  await step(results, 'notifications_list', () => ig.notificationsList({ limit: 5 }));
  await step(results, 'followers_list', () => ig.followersList({ username: me, limit: 5 }), (o) => o?.dialogOpened === true);
  await step(results, 'following_list', () => ig.followingList({ username: me, limit: 5 }), (o) => o?.dialogOpened === true);
  // Probe akun publik besar: menangkap regresi pengambilan baris dialog
  // (akun sendiri bisa saja lolos sementara struktur baris berubah).
  await step(results, 'followers_list (public probe)', () => ig.followersList({ username: 'instagram', limit: 5 }), (o) => o?.count > 0);
  await step(results, 'user_posts', () => ig.userPosts({ username: me, limit: 3 }));
  await step(results, 'dm_check', () => ig.dmCheck({ limit: 3 }));
  // post_comments dan media_urls ikut level safe memakai post explore pertama.
  const probeUrl = explore?.posts?.[0]?.url;
  if (probeUrl) {
    await step(results, 'post_comments', () => ig.postComments({ url: probeUrl, limit: 3 }));
    await step(results, 'media_urls', () => ig.mediaUrls({ url: probeUrl }), (o) => o.count > 0);
  } else {
    results.push({ tool: 'post_comments', ok: true, detail: 'Dilewati: tidak ada post dari explore untuk probe.' });
    results.push({ tool: 'media_urls', ok: true, detail: 'Dilewati: tidak ada post dari explore untuk probe.' });
  }

  if (level !== 'full') {
    const passed = results.filter((r) => r.ok).length;
    return { ran: true, level, passed, failed: results.length - passed, results, warning: SELFTEST_WARNING };
  }

  // --- Tulis (level full): semua pada konten sendiri, dibersihkan di akhir ---
  const cleanup = [];
  let postUrl = null;
  const created = await step(results, 'post_create', () => ig.postCreate({ files: [FIXTURE], caption: `${MARK} - akan dihapus otomatis` }), (o) => o?.posted === true);
  if (created?.posted) {
    const mine = await ig.userPosts({ username: me, limit: 3 }).catch(() => null);
    postUrl = mine?.posts?.[0]?.url || null;
  }
  if (postUrl) {
    await step(results, 'post_get', () => ig.postGet({ url: postUrl }));
    await step(results, 'media_urls', () => ig.mediaUrls({ url: postUrl }), (o) => o.count > 0);
    await step(results, 'post_like', () => ig.postLike({ url: postUrl }), (o) => o?.liked === true);
    await step(results, 'post_comment', () => ig.postComment({ url: postUrl, text: `${MARK} comment` }), (o) => o?.commented === true);
    await step(results, 'post_comments', () => ig.postComments({ url: postUrl, limit: 10 }), (o) => JSON.stringify(o).includes(MARK));
    await step(results, 'post_reply_to_comment', () => ig.postReplyToComment({ url: postUrl, match: MARK, text: `${MARK} reply` }), (o) => o?.replied === true);
    await step(results, 'comment_like', () => ig.commentLike({ url: postUrl, match: MARK }), (o) => o?.liked === true);
    await step(results, 'post_save', () => ig.postSave({ url: postUrl }), (o) => o?.saved === true);
  } else {
    for (const t of ['post_get', 'media_urls', 'post_like', 'post_comment', 'post_comments', 'post_reply_to_comment', 'comment_like', 'post_save'])
      results.push({ tool: t, ok: false, detail: 'Dilewati: post tes tidak terbuat / URL tidak ditemukan.' });
  }

  // Follow lalu kembalikan ke state awal.
  const target = env.selftestTarget || 'instagram';
  const before = await ig.profileGet({ username: target }).catch(() => null);
  void before;
  const fol = await step(results, 'user_follow', () => ig.userFollow({ username: target }));
  if (fol && !fol.already) {
    const un = await ig.userUnfollow({ username: target }).catch((e) => ({ error: e.message }));
    cleanup.push({ tool: 'user_unfollow (restore)', detail: summarize(un) });
    results.push({ tool: 'user_unfollow', ok: Boolean(un?.unfollowed || un?.following === false), detail: summarize(un) });
  } else {
    results.push({ tool: 'user_unfollow', ok: true, detail: 'Dilewati: target sudah di-follow sebelum tes, state dibiarkan apa adanya.' });
  }

  // Story: buat dari fixture, lihat, lalu hapus.
  const sc = await step(results, 'story_create', () => ig.storyCreate({ file: FIXTURE }), (o) => o?.created === true);
  if (sc?.created) {
    await step(results, 'story_view', () => ig.storyView({ username: me }), (o) => o?.viewed === true);
    const sd = await ig.storyDelete().catch((e) => ({ error: e.message }));
    cleanup.push({ tool: 'story_delete (cleanup)', detail: summarize(sd) });
    results.push({ tool: 'story_delete', ok: Boolean(sd?.deleted), detail: summarize(sd) });
  }

  // DM tulis hanya ke target yang disetujui eksplisit (akun pemilik sendiri).
  if (env.selftestDmTarget) {
    await step(results, 'dm_send_to_user', () => ig.dmSendToUser({ username: env.selftestDmTarget, text: `${MARK}: tes kirim, abaikan ya` }), (o) => o?.sent === true);
  } else {
    results.push({ tool: 'dm_send_to_user', ok: true, detail: 'Dilewati: IG_SELFTEST_DM_TARGET tidak diisi (tidak mengirim DM ke siapa pun).' });
  }

  // --- Cleanup terakhir: hapus post tes ---
  if (postUrl) {
    const pd = await ig.postDelete({ url: postUrl }).catch((e) => ({ error: e.message }));
    cleanup.push({ tool: 'post_delete (cleanup)', detail: summarize(pd) });
    results.push({ tool: 'post_delete', ok: Boolean(pd?.deleted), detail: summarize(pd) });
  }

  const passed = results.filter((r) => r.ok).length;
  return { ran: true, level, account: me, passed, failed: results.length - passed, results, cleanup, warning: SELFTEST_WARNING };
}
