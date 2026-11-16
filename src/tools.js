import * as ig from './instagram.js';
import { runSelfTest } from './selftest.js';

// Definisi tool MCP + handler-nya. Nama tool = kontrak untuk AI agent.
// Konvensi agentic: tool BACA diberi readOnlyHint; tool TULIS diberi destructiveHint +
// keterangan efek samping di deskripsi, supaya agent pemanggil bisa menimbang sebelum eksekusi.
// Semua tool TULIS tunduk pada IG_DRY_RUN di .env (default true = simulasi).
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = { type: 'string' };
const num = { type: 'number' };
const RO = { readOnlyHint: true, openWorldHint: true };
const WR = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

export const TOOLS = [
  { name: 'ig_status', description: 'Cek koneksi browser & akun Instagram yang sedang login. Panggil ini pertama kali.', inputSchema: S({}), annotations: RO, run: () => ig.status() },
  { name: 'dm_list_threads', description: 'Daftar thread DM teratas (klik-scan, karena daftar IG menyusut jadi avatar). EFEK SAMPING: membuka thread dapat menandainya terbaca.', inputSchema: S({ limit: num }), annotations: RO, run: (a) => ig.dmListThreads(a) },
  { name: 'dm_check', description: 'Cek thread mana yang pesan terakhirnya dari lawan bicara (perlu dibalas). Baca saja, tidak membalas apa pun.', inputSchema: S({ limit: num }), annotations: RO, run: (a) => ig.dmCheck(a) },
  { name: 'dm_read_thread', description: 'Baca isi 1 thread DM: username, nama, dan pesan-pesan terakhir dengan arahnya (fromMe true = pesan akun sendiri).', inputSchema: S({ threadId: str, limit: num }, ['threadId']), annotations: RO, run: (a) => ig.dmReadThread(a) },
  { name: 'dm_send', description: 'Kirim / balas pesan di thread DM yang sudah ada (berdasarkan threadId). AKSI TULIS: benar-benar terkirim kecuali IG_DRY_RUN=true.', inputSchema: S({ threadId: str, text: str }, ['threadId', 'text']), annotations: WR, run: (a) => ig.dmSend(a) },
  { name: 'dm_send_to_user', description: 'Kirim DM ke username tertentu (buka profil, klik Message, lalu kirim). AKSI TULIS seperti dm_send.', inputSchema: S({ username: str, text: str }, ['username', 'text']), annotations: WR, run: (a) => ig.dmSendToUser(a) },
  { name: 'profile_get', description: 'Ambil info profil Instagram (bio, jumlah post/followers/following). Tanpa username = profil akun yang login.', inputSchema: S({ username: str }), annotations: RO, run: (a) => ig.profileGet(a) },
  { name: 'search', description: 'Cari user & hashtag di Instagram dari kata kunci.', inputSchema: S({ query: str, limit: num }, ['query']), annotations: RO, run: (a) => ig.search(a) },
  { name: 'post_like', description: 'Like sebuah post/reel dari URL-nya. Idempotent: kalau sudah di-like, dilaporkan alreadyLiked. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ url: str }, ['url']), annotations: WR, run: (a) => ig.postLike(a) },
  { name: 'post_comment', description: 'Komentar baru di post/reel dari URL-nya. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ url: str, text: str }, ['url', 'text']), annotations: WR, run: (a) => ig.postComment(a) },
  { name: 'post_reply_to_comment', description: 'Balas SATU komentar spesifik di sebuah post: cari komentar yang memuat teks `match`, klik Reply, lalu kirim balasan. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ url: str, match: str, text: str }, ['url', 'match', 'text']), annotations: WR, run: (a) => ig.postReplyToComment(a) },
  { name: 'post_create', description: 'Buat post baru dari file gambar lokal + caption. Dengan IG_DRY_RUN=true berhenti tepat sebelum tombol Share.', inputSchema: S({ files: { type: 'array', items: str }, caption: str }, ['files']), annotations: WR, run: (a) => ig.postCreate(a) },
  // --- Konten & discovery (baca) ---
  { name: 'user_posts', description: 'Daftar post/reel terbaru dari profil seorang user (URL saja). Berguna untuk riset konten & monitoring kompetitor.', inputSchema: S({ username: str, limit: num }, ['username']), annotations: RO, run: (a) => ig.userPosts(a) },
  { name: 'post_get', description: 'Detail sebuah post/reel: penulis, waktu, jenis media, dan teks halaman (caption, jumlah like/komen bila tampil).', inputSchema: S({ url: str }, ['url']), annotations: RO, run: (a) => ig.postGet(a) },
  { name: 'post_comments', description: 'Baca komentar-komentar sebuah post. Pasangan baca dari post_reply_to_comment: baca dulu, putuskan, baru balas.', inputSchema: S({ url: str, limit: num }, ['url']), annotations: RO, run: (a) => ig.postComments(a) },
  { name: 'feed_home', description: 'Intip timeline beranda akun yang login (postingan terbaru + penulisnya).', inputSchema: S({ limit: num }), annotations: RO, run: (a) => ig.feedHome(a) },
  { name: 'explore_posts', description: 'Daftar post dari halaman Explore saat ini.', inputSchema: S({ limit: num }), annotations: RO, run: (a) => ig.explorePosts(a) },
  { name: 'hashtag_posts', description: 'Daftar post di halaman sebuah hashtag. Berguna untuk riset topik/niche.', inputSchema: S({ tag: str, limit: num }, ['tag']), annotations: RO, run: (a) => ig.hashtagPosts(a) },
  { name: 'media_urls', description: 'Ambil URL file gambar/video dari sebuah post (untuk diunduh/diolah agent).', inputSchema: S({ url: str }, ['url']), annotations: RO, run: (a) => ig.mediaUrls(a) },
  // --- Sosial & engagement ---
  { name: 'user_follow', description: 'Follow seorang user. Idempotent: state Following/Requested dilaporkan apa adanya. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ username: str }, ['username']), annotations: WR, run: (a) => ig.userFollow(a) },
  { name: 'user_unfollow', description: 'Unfollow seorang user (dengan dialog konfirmasi IG). AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ username: str }, ['username']), annotations: WR, run: (a) => ig.userUnfollow(a) },
  { name: 'followers_list', description: 'Daftar username followers seorang user (dari dialog followers). Batas hasil mengikuti yang dimuat IG.', inputSchema: S({ username: str, limit: num }, ['username']), annotations: RO, run: (a) => ig.followersList(a) },
  { name: 'following_list', description: 'Daftar username yang di-follow seorang user (dari dialog following).', inputSchema: S({ username: str, limit: num }, ['username']), annotations: RO, run: (a) => ig.followingList(a) },
  { name: 'comment_like', description: 'Like satu komentar spesifik (cari yang memuat teks `match`). AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ url: str, match: str }, ['url', 'match']), annotations: WR, run: (a) => ig.commentLike(a) },
  { name: 'post_save', description: 'Simpan (bookmark) sebuah post. Idempotent. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ url: str }, ['url']), annotations: WR, run: (a) => ig.postSave(a) },
  { name: 'notifications_list', description: 'Baca panel notifikasi: like/komen/follow/mention terbaru ke akun yang login. Kunci untuk engagement: dari sini agent tahu siapa yang harus dibalas.', inputSchema: S({ limit: num }), annotations: RO, run: (a) => ig.notificationsList(a) },
  { name: 'story_view', description: 'Buka story seorang user dan laporkan isinya secara ringkas. EFEK: story tertanda sudah dilihat.', inputSchema: S({ username: str }, ['username']), annotations: WR, run: (a) => ig.storyView(a) },
  { name: 'story_reply', description: 'Balas story seorang user dengan teks (masuk sebagai DM). AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ username: str, text: str }, ['username', 'text']), annotations: WR, run: (a) => ig.storyReply(a) },
  { name: 'post_delete', description: 'Hapus post MILIK SENDIRI dari URL-nya. Menolak bila penulisnya bukan akun yang login. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ url: str }, ['url']), annotations: WR, run: (a) => ig.postDelete(a) },
  { name: 'stories_tray', description: 'Daftar akun dengan story aktif di tray beranda saat ini (untuk memilih story mana yang dilihat).', inputSchema: S({ limit: num }), annotations: RO, run: (a) => ig.storiesTray(a) },
  { name: 'story_create', description: 'Buat story baru: dari file gambar, atau story teks (text) bila editor teks IG web tersedia untuk akun ini. BATASAN PLATFORM: Instagram Web tidak selalu menyediakan pintu pembuatan story (terverifikasi 16 Nov 2026: akun uji tidak punya entry point story sama sekali di web); tool melaporkan itu dengan jelas bila tidak tersedia. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ file: str, text: str }), annotations: WR, run: (a) => ig.storyCreate(a) },
  { name: 'story_create_poll', description: 'Buat story dengan stiker POLLING: question + 2 options (bawaan IG) di atas file gambar. Gagal dengan alasan jelas bila pembuatan story / stiker tidak tersedia di IG web akun ini; story tidak dibagikan bila polling gagal terpasang. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({ file: str, question: str, options: { type: 'array', items: str } }, ['question']), annotations: WR, run: (a) => ig.storyCreatePoll(a) },
  { name: 'story_delete', description: 'Hapus story aktif MILIK SENDIRI yang sedang tayang. AKSI TULIS kecuali IG_DRY_RUN=true.', inputSchema: S({}), annotations: WR, run: () => ig.storyDelete() },
  { name: 'ig_selftest', description: 'Jalankan self-test resmi. Level "safe" (default): hanya tool baca, aman di akun mana pun. Level "full": menguji SEMUA tool tulis pada konten buatan sendiri lalu MENGHAPUS semuanya di akhir; gerbang keras IG_SELFTEST_FULL=true + IG_DRY_RUN=false + IG_SELFTEST_ACCOUNT harus sama dengan akun login. PERINGATAN: level full hanya di akun kedua, jangan akun utama.', inputSchema: S({ level: str }), annotations: WR, run: (a) => runSelfTest(a) },
];

// Kategori (prefix) untuk pengelompokan di TUI, CLI, dan docs.
export const CATEGORIES = [
  ['System', ['ig_status', 'ig_selftest']],
  ['DM', ['dm_list_threads', 'dm_check', 'dm_read_thread', 'dm_send', 'dm_send_to_user']],
  ['Profile & Search', ['profile_get', 'search']],
  ['Posts', ['post_create', 'post_get', 'post_like', 'post_comment', 'post_reply_to_comment', 'comment_like', 'post_save', 'post_delete', 'user_posts', 'post_comments', 'media_urls']],
  ['Discovery', ['feed_home', 'explore_posts', 'hashtag_posts']],
  ['Social', ['user_follow', 'user_unfollow', 'followers_list', 'following_list', 'notifications_list']],
  ['Stories', ['stories_tray', 'story_view', 'story_reply', 'story_create', 'story_create_poll', 'story_delete']],
];
export const toolCategory = (name) => (CATEGORIES.find(([, names]) => names.includes(name)) || ['Other'])[0];

export const toolList = () => TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));
export const findTool = (name) => TOOLS.find((t) => t.name === name);
