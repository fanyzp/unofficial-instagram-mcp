import { env, selectors as S, sleep, randDelay } from './config.js';
import { getPage, dismissDialogs } from './browser.js';

const threadUrl = (id) => `https://www.instagram.com/direct/t/${String(id).replace(/\//g, '')}/`;

// ---------- STATUS ----------
export async function status() {
  const page = await getPage();
  if (!page.url().includes('instagram.com')) await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const username = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => /'s profile picture/.test(x.getAttribute('aria-label') || '') || /profile picture/.test(x.querySelector('img')?.alt || ''));
    const m = (a?.getAttribute('aria-label') || a?.querySelector('img')?.alt || '').match(/^(.+?)'s profile picture/);
    return m ? m[1] : null;
  }).catch(() => null);
  return { connected: true, signedInUser: username, url: page.url(), dryRun: env.dryRun };
}

// ---------- DM ----------
export async function dmListThreads({ limit = 10 } = {}) {
  const page = await getPage();
  await page.goto(S.dm.inboxUrl, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  // Layout terverifikasi: daftar sering menyusut jadi avatar saja -> klik-scan adalah jalur utama.
  const items = page.locator(`${S.dm.threadListNav} button, ${S.dm.threadListNav} a`);
  const n = Math.min(await items.count().catch(() => 0), limit);
  const threads = [];
  for (let i = 0; i < n; i++) {
    await items.nth(i).click().catch(() => {});
    await sleep(1200 + Math.floor(Math.random() * 1400));
    const m = page.url().match(/\/direct\/t\/(\d+)/);
    if (m) {
      const head = await readThreadHead(page);
      threads.push({ position: i + 1, threadId: m[1], username: head.username, name: head.name, lastMessageFromMe: head.lastFromMe, lastMessage: head.lastText });
    }
    await page.goto(S.dm.inboxUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(800 + Math.floor(Math.random() * 900));
  }
  return { count: threads.length, threads, note: 'Membuka thread dapat menandainya terbaca di Instagram.' };
}

async function readThreadHead(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('h2');
    const lines = (heading?.parentElement?.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const arts = [...document.querySelectorAll('article')];
    const last = arts[arts.length - 1];
    let lastFromMe = null, lastText = '';
    if (last) {
      const r = last.getBoundingClientRect();
      lastFromMe = (r.left + r.width / 2) > window.innerWidth * 0.58;
      lastText = (last.getAttribute('aria-label') || last.innerText || '').trim().slice(0, 200);
    }
    return { name: lines[0] || '', username: lines[1] || '', lastFromMe, lastText };
  }).catch(() => ({ name: '', username: '', lastFromMe: null, lastText: '' }));
}

export async function dmReadThread({ threadId, limit = 20 }) {
  const page = await getPage();
  await page.goto(threadUrl(threadId), { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const head = await readThreadHead(page);
  const messages = await page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const text = (el.getAttribute('aria-label') || el.innerText || '').trim();
      if (!text || text.length > 2000) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      out.push({ text, fromMe: (r.left + r.width / 2) > window.innerWidth * 0.58 });
    }
    return out;
  }, S.dm.messageBubble).catch(() => []);
  return { threadId: String(threadId), ...head, messages: messages.slice(-limit) };
}

export async function dmCheck({ limit = 10 } = {}) {
  const { threads } = await dmListThreads({ limit });
  const needsReply = threads.filter((t) => t.lastMessageFromMe === false);
  return { checked: threads.length, needsReplyCount: needsReply.length, needsReply };
}

export async function dmSend({ threadId, text }) {
  const page = await getPage();
  await page.goto(threadUrl(threadId), { waitUntil: 'domcontentloaded' });
  await sleep(2200); await dismissDialogs(page);
  if (env.dryRun) return { sent: false, dryRun: true, wouldSend: text, threadId: String(threadId) };
  await sleep(randDelay());
  const box = page.locator(S.dm.composerInput).first();
  await box.click();
  await box.pressSequentially(text, { delay: 45 });
  await sleep(800);
  const send = page.locator(S.dm.sendButton).first();
  if (await send.isVisible().catch(() => false)) await send.click(); else await box.press('Enter');
  await sleep(1200);
  return { sent: true, threadId: String(threadId), text };
}

// DM ke user TANPA thread yang sudah ada: buka profil -> tombol Message -> composer.
export async function dmSendToUser({ username, text }) {
  const page = await getPage();
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2200); await dismissDialogs(page);
  const msgBtn = page.getByRole('button', { name: /message/i }).first();
  await msgBtn.click(); await sleep(2500);
  const m = page.url().match(/\/direct\/t\/(\d+)/);
  if (!m) throw new Error('Tidak sampai ke halaman thread setelah klik Message.');
  if (env.dryRun) return { sent: false, dryRun: true, wouldSend: text, username, threadId: m[1] };
  return { ...(await dmSend({ threadId: m[1], text })), username };
}

// ---------- PROFILE ----------
export async function profileGet({ username } = {}) {
  const page = await getPage();
  const own = username ? null : (await status()).signedInUser;
  const user = username || own;
  if (!user) throw new Error('Username tidak diketahui (tidak login / tidak diberi).');
  await page.goto(`https://www.instagram.com/${user}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const data = await page.evaluate(() => {
    const header = document.querySelector('header') || document.querySelector('main');
    const text = (header?.innerText || '').replace(/\n+/g, '\n').trim();
    const counts = [...(header?.querySelectorAll('li, span') || [])]
      .map((e) => e.innerText.trim()).filter((t) => /posts|followers|following|kiriman|pengikut|mengikuti/i.test(t));
    const bio = [...(header?.querySelectorAll('span, div') || [])].map((e) => e.innerText?.trim()).filter(Boolean);
    // Cadangan bila header tidak memuat statistik dalam bentuk yang dikenali:
    // pola "N posts / N followers / N following" di teks halaman, lalu meta og:description.
    const stats = {};
    const grab = (src) => {
      if (!src) return;
      for (const [key, re] of [['posts', /([\d.,]+\s*[KMkm]?)\s*(?:posts|kiriman)/i], ['followers', /([\d.,]+\s*[KMkm]?)\s*(?:followers|pengikut)/i], ['following', /([\d.,]+\s*[KMkm]?)\s*(?:following|mengikuti)/i]]) {
        if (stats[key]) continue;
        const m = src.match(re);
        if (m) stats[key] = m[1].replace(/\s+/g, '');
      }
    };
    grab(text);
    grab(document.querySelector('main')?.innerText || '');
    grab(document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '');
    return { headerText: text.slice(0, 800), counts, stats, bioLines: [...new Set(bio)].slice(0, 12) };
  }).catch(() => ({}));
  return { username: user, url: page.url(), ...data };
}

// ---------- SEARCH ----------
export async function search({ query, limit = 15 }) {
  const page = await getPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  // Pencarian akun yang sebenarnya ada di PANEL Search pada nav: mengetik di sana
  // menampilkan baris akun + hashtag. URL keyword hanya memberi grid media, jadi
  // panel ini jalur utama; grid keyword hanya cadangan bila panel tidak terbuka.
  let results = [];
  try {
    const icon = page.locator('svg[aria-label="Search" i], svg[aria-label="Cari" i]').first();
    await icon.click({ timeout: 5000 });
    await sleep(1200);
    const input = page.locator('input[placeholder*="Search" i], input[placeholder*="Cari" i]').first();
    await input.click({ timeout: 5000 });
    await input.pressSequentially(query, { delay: 60 });
    await sleep(2800);
    results = await page.evaluate((lim) => {
      const out = []; const seen = new Set();
      for (const a of document.querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute('href');
        if (!href || seen.has(href)) continue;
        const seg = href.split('/').filter(Boolean);
        const label = (a.innerText || '').replace(/\s*\n\s*/g, ' | ').trim().slice(0, 140);
        if (seg.length === 1 && !['explore', 'direct', 'reels', 'accounts', 'stories'].includes(seg[0])) {
          // Baris akun punya avatar; lewati link nav polos tanpa gambar.
          if (!a.querySelector('img')) continue;
          seen.add(href); out.push({ type: 'user', username: seg[0], url: 'https://www.instagram.com' + href, label });
        } else if (href.includes('/explore/search/keyword/') || (seg[0] === 'explore' && seg[1] === 'tags')) {
          seen.add(href); out.push({ type: 'hashtag', url: 'https://www.instagram.com' + href, label });
        }
        if (out.length >= lim) break;
      }
      return out;
    }, limit);
  } catch { results = []; }
  if (results.length) return { query, count: results.length, results, source: 'search-panel' };
  // Cadangan: halaman keyword (grid media bertema query).
  await page.goto(S.search.url + encodeURIComponent(query), { waitUntil: 'domcontentloaded' });
  await sleep(3000); await dismissDialogs(page);
  const grid = await page.evaluate((lim) => {
    const out = []; const seen = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href) continue;
      const m = href.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
      if (!m) continue;
      const kind = m[1] === 'p' ? 'p' : 'reel';
      const key = `${kind}/${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type: kind === 'p' ? 'post' : 'reel', url: `https://www.instagram.com/${kind}/${m[2]}/`, label: (a.querySelector('img')?.alt || '').slice(0, 160) });
      if (out.length >= lim) break;
    }
    return out;
  }, limit).catch(() => []);
  return { query, count: grid.length, results: grid, source: 'keyword-grid', note: 'Panel pencarian tidak terbuka; hasil ini grid media dari halaman keyword, bukan daftar akun. Untuk akun, panggil profile_get dengan username yang ditebak.' };
}

// ---------- LIKE / COMMENT ----------
export async function postLike({ url }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const already = await page.locator(S.like.unlikeBtn).first().isVisible().catch(() => false);
  if (already) return { liked: true, alreadyLiked: true, url };
  if (env.dryRun) return { liked: false, dryRun: true, wouldLike: url };
  await page.locator(S.like.likeBtn).first().click();
  await sleep(1000);
  const now = await page.locator(S.like.unlikeBtn).first().isVisible().catch(() => false);
  return { liked: now, url };
}

// Balas SATU komentar spesifik: cari komentar yang memuat `match`, klik Reply-nya, ketik, kirim.
export async function postReplyToComment({ url, match, text }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const comment = page.locator('ul li, div[role="button"]', { hasText: match }).first();
  // Tombol Reply muncul saat komentar di-hover/fokus.
  await comment.hover().catch(() => {});
  await sleep(600);
  const replyBtn = page.getByRole('button', { name: /^reply$/i }).first();
  const found = await replyBtn.isVisible().catch(() => false);
  if (!found) return { replied: false, reason: `Komentar memuat "${match}" / tombol Reply tidak ditemukan di halaman ini.`, url };
  if (env.dryRun) return { replied: false, dryRun: true, replyButtonFound: true, wouldReply: text, match, url };
  await replyBtn.click(); await sleep(800);
  const box = page.locator('textarea[placeholder*="comment" i], textarea[aria-label*="comment" i], form textarea').first();
  await box.click(); await box.pressSequentially(text, { delay: 40 }); await sleep(700);
  const post = page.getByRole('button', { name: /^post$/i }).first();
  if (await post.isVisible().catch(() => false)) await post.click(); else await box.press('Enter');
  await sleep(1200);
  return { replied: true, match, text, url };
}

export async function postComment({ url, text }) {  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  if (env.dryRun) return { commented: false, dryRun: true, wouldComment: text, url };
  const box = page.locator('textarea[placeholder*="comment" i], textarea[aria-label*="comment" i]').first();
  await box.click(); await box.fill(text); await sleep(700);
  const post = page.getByRole('button', { name: /^post$/i }).first();
  if (await post.isVisible().catch(() => false)) await post.click(); else await box.press('Enter');
  await sleep(1200);
  return { commented: true, url, text };
}

// ---------- KONTEN: BACA (post, komentar, feed, explore, hashtag) ----------
async function collectPostLinks(page, limit) {
  return page.evaluate((lim) => {
    const out = []; const seen = new Set();
    // IG kini merender link postingan profil sebagai /<username>/p/<code>/ dan
    // /<username>/reel/<code>/, bukan /p/<code>/ polos. Cocokkan pola kodenya di
    // posisi mana pun pada path, lalu bangun URL kanoniknya.
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href) continue;
      const m = href.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
      if (!m) continue;
      const kind = m[1] === 'p' ? 'p' : 'reel';
      const key = `${kind}/${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: `https://www.instagram.com/${kind}/${m[2]}/`, type: kind === 'p' ? 'post' : 'reel' });
      if (out.length >= lim) break;
    }
    return out;
  }, limit).catch(() => []);
}

export async function userPosts({ username, limit = 12 }) {
  const page = await getPage();
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const posts = await collectPostLinks(page, limit);
  return { username, count: posts.length, posts };
}

export async function postGet({ url }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const data = await page.evaluate(() => {
    const art = document.querySelector('article') || document.querySelector('main');
    const text = (art?.innerText || '').trim();
    // Penulis = link profil di HEADER artikel. Link profil pertama di seluruh
    // artikel bisa milik akun yang di-tag / disarankan, bukan penulisnya.
    const segOf = (a) => (a?.getAttribute('href') || '').split('/').filter(Boolean);
    let author = '';
    const headerLink = art?.querySelector('header a[href^="/"]');
    if (headerLink && segOf(headerLink).length === 1) author = segOf(headerLink)[0];
    if (!author) {
      const single = [...(art?.querySelectorAll('a[href^="/"]') || [])].find((a) => segOf(a).length === 1);
      if (single) author = segOf(single)[0];
    }
    const time = art?.querySelector('time')?.getAttribute('datetime') || '';
    const media = [...(art?.querySelectorAll('img, video') || [])].map((m) => m.tagName === 'VIDEO' ? 'video' : 'image');
    return { author, time, mediaTypes: [...new Set(media)], pageText: text.slice(0, 1500) };
  }).catch(() => ({}));
  // URL berbentuk /<username>/p/<code>/ menyebut penulisnya secara eksplisit.
  const urlUser = new URL(page.url()).pathname.split('/').filter(Boolean);
  const fromUrl = urlUser.length >= 3 && (urlUser[1] === 'p' || urlUser[1] === 'reel') ? urlUser[0] : '';
  return { url, ...data, author: fromUrl || data.author || '' };
}

export async function postComments({ url, limit = 20 }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(3000); await dismissDialogs(page);
  const comments = await page.evaluate((lim) => {
    const out = []; const seen = new Set();
    for (const li of document.querySelectorAll('article ul li, main ul li')) {
      const t = (li.innerText || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length < 3 || seen.has(t)) continue;
      seen.add(t); out.push({ text: t.slice(0, 400) });
      if (out.length >= lim) break;
    }
    return out;
  }, limit).catch(() => []);
  return { url, count: comments.length, comments, note: 'Teks komentar apa adanya dari halaman (memuat username, isi, dan metadata seperti waktu/tombol Reply bila tampil).' };
}

export async function feedHome({ limit = 10 } = {}) {
  const page = await getPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(3500); await dismissDialogs(page);
  const posts = await page.evaluate((lim) => {
    const out = [];
    for (const art of document.querySelectorAll('article')) {
      // Link postingan bisa berbentuk /<username>/p/<code>/; cocokkan pola kodenya.
      let url = null;
      for (const a of art.querySelectorAll('a[href]')) {
        const m = (a.getAttribute('href') || '').match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
        if (m) { url = `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/`; break; }
      }
      // Penulis dari header artikel, bukan link profil pertama sembarangan.
      const segOf = (a) => (a?.getAttribute('href') || '').split('/').filter(Boolean);
      const headerLink = art.querySelector('header a[href^="/"]');
      const author = headerLink && segOf(headerLink).length === 1 ? segOf(headerLink)[0] : '';
      out.push({ author, url, snippet: (art.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220) });
      if (out.length >= lim) break;
    }
    return out;
  }, limit).catch(() => []);
  return { count: posts.length, posts };
}

export async function explorePosts({ limit = 15 } = {}) {
  const page = await getPage();
  await page.goto('https://www.instagram.com/explore/', { waitUntil: 'domcontentloaded' });
  await sleep(3000); await dismissDialogs(page);
  return { count: (await collectPostLinks(page, limit)).length, posts: await collectPostLinks(page, limit) };
}

export async function hashtagPosts({ tag, limit = 15 }) {
  const page = await getPage();
  const clean = String(tag).replace(/^#/, '');
  await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(clean)}/`, { waitUntil: 'domcontentloaded' });
  await sleep(3000); await dismissDialogs(page);
  const posts = await collectPostLinks(page, limit);
  return { tag: clean, count: posts.length, posts };
}

export async function mediaUrls({ url }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const media = await page.evaluate(() => {
    const art = document.querySelector('article') || document;
    return [...art.querySelectorAll('img, video')].map((m) => ({ type: m.tagName === 'VIDEO' ? 'video' : 'image', src: m.currentSrc || m.src || '' })).filter((m) => m.src.startsWith('http'));
  }).catch(() => []);
  return { url, count: media.length, media };
}

// ---------- SOSIAL: follow, followers, like-komen, save ----------
export async function userFollow({ username }) {
  const page = await getPage();
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const state = async () => {
    for (const label of ['Following', 'Requested', 'Follow', 'Follow back']) {
      if (await page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first().isVisible().catch(() => false)) return label;
    }
    return 'unknown';
  };
  const before = await state();
  if (before === 'Following' || before === 'Requested') return { username, following: true, already: before };
  if (env.dryRun) return { username, following: false, dryRun: true, wouldFollow: true, currentState: before };
  await page.getByRole('button', { name: /^follow( back)?$/i }).first().click();
  await sleep(1200);
  return { username, following: (await state()) !== 'Follow', state: await state() };
}

export async function userUnfollow({ username }) {
  const page = await getPage();
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const btn = page.getByRole('button', { name: /^(following|requested)$/i }).first();
  if (!(await btn.isVisible().catch(() => false))) return { username, following: false, already: true };
  if (env.dryRun) return { username, dryRun: true, wouldUnfollow: true };
  await btn.click(); await sleep(1200);
  const confirm = page.getByRole('button', { name: /^unfollow$/i }).first();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await sleep(1200);
  return { username, following: false, unfollowed: true };
}

async function userList(page, username, kind, limit) {
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const link = page.locator(`a[href$="/${kind}/"]`).first();
  await link.click(); await sleep(2500);
  const users = await page.evaluate((lim) => {
    const dlg = document.querySelector('div[role="dialog"]') || document;
    const out = []; const seen = new Set();
    for (const a of dlg.querySelectorAll('a[href^="/"]')) {
      const seg = a.getAttribute('href').split('/').filter(Boolean);
      if (seg.length === 1 && !seen.has(seg[0])) { seen.add(seg[0]); out.push(seg[0]); if (out.length >= lim) break; }
    }
    return out;
  }, limit).catch(() => []);
  return users;
}
export async function followersList({ username, limit = 30 }) {
  const page = await getPage();
  const users = await userList(page, username, 'followers', limit);
  return { username, kind: 'followers', count: users.length, users };
}
export async function followingList({ username, limit = 30 }) {
  const page = await getPage();
  const users = await userList(page, username, 'following', limit);
  return { username, kind: 'following', count: users.length, users };
}

export async function commentLike({ url, match }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(3000); await dismissDialogs(page);
  const li = page.locator('li, div', { hasText: match }).last();
  await li.hover().catch(() => {});
  await sleep(500);
  const heart = li.locator('svg[aria-label="Like"]').first();
  const found = await heart.isVisible().catch(() => false);
  if (!found) return { liked: false, reason: 'Tombol like komentar tidak ditemukan (komentar/selector berubah).', url, match };
  if (env.dryRun) return { liked: false, dryRun: true, likeButtonFound: true, match, url };
  await heart.click(); await sleep(800);
  return { liked: true, match, url };
}

export async function postSave({ url }) {
  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const remove = page.locator('svg[aria-label="Remove"]').first();
  if (await remove.isVisible().catch(() => false)) return { saved: true, alreadySaved: true, url };
  if (env.dryRun) return { saved: false, dryRun: true, wouldSave: url };
  await page.locator('svg[aria-label="Save"]').first().click(); await sleep(1000);
  return { saved: true, url };
}

// Hapus post MILIK SENDIRI dari URL-nya. Menolak bila penulis post bukan akun yang login.
export async function postDelete({ url }) {
  const page = await getPage();
  const me = (await status()).signedInUser;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const author = await page.evaluate(() => {
    const segOf = (a) => (a?.getAttribute('href') || '').split('/').filter(Boolean);
    const headerLink = document.querySelector('article header a[href^="/"]');
    if (headerLink && segOf(headerLink).length === 1) return segOf(headerLink)[0];
    const seg = location.pathname.split('/').filter(Boolean);
    return seg.length >= 3 && (seg[1] === 'p' || seg[1] === 'reel') ? seg[0] : '';
  }).catch(() => '');
  if (me && author && author !== me) return { deleted: false, reason: `Post ini milik @${author}, bukan akun login @${me}. post_delete hanya untuk post sendiri.`, url };
  const more = page.locator('svg[aria-label="More options"], svg[aria-label="More Options"]').first();
  if (!(await more.isVisible().catch(() => false))) return { deleted: false, reason: 'Tombol opsi (titik tiga) tidak ditemukan di post ini.', url };
  await more.click(); await sleep(1200);
  const del = page.getByRole('button', { name: /^delete$/i }).first();
  if (!(await del.isVisible().catch(() => false))) return { deleted: false, reason: 'Menu Delete tidak muncul (mungkin bukan post sendiri / UI berubah).', url };
  if (env.dryRun) { await page.keyboard.press('Escape').catch(() => {}); return { deleted: false, dryRun: true, wouldDelete: url, author }; }
  await del.click(); await sleep(1500);
  const confirm = page.getByRole('button', { name: /^delete$/i }).first();
  if (await confirm.isVisible().catch(() => false)) { await confirm.click(); await sleep(2000); }
  return { deleted: true, url, author };
}

// ---------- STORY & NOTIFIKASI ----------
export async function notificationsList({ limit = 20 } = {}) {
  const page = await getPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const btn = page.locator('svg[aria-label="Notifications"]').first();
  await btn.click(); await sleep(2500);
  const items = await page.evaluate((lim) => {
    const panel = [...document.querySelectorAll('div, section')].find((e) => /Notifications|Notifikasi/.test(e.querySelector('h2,h1,span')?.textContent || ''));
    const root = panel || document.body;
    return [...root.querySelectorAll('a[href^="/"], div[role="button"]')]
      .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 8)
      .filter((v, i, a) => a.indexOf(v) === i).slice(0, lim).map((text) => ({ text: text.slice(0, 220) }));
  }, limit).catch(() => []);
  return { count: items.length, notifications: items, note: 'Panel notifikasi web; urutan & isi mengikuti tampilan IG saat dipanggil.' };
}

export async function storyView({ username }) {
  const page = await getPage();
  await page.goto(`https://www.instagram.com/stories/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(3500); await dismissDialogs(page);
  const info = await page.evaluate(() => ({
    url: location.href,
    hasReplyBox: Boolean(document.querySelector('textarea, input[placeholder*="Reply" i], input[placeholder*="Balas" i]')),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  })).catch(() => ({}));
  return { username, viewed: page.url().includes('/stories/'), ...info, note: 'Membuka story menandainya sebagai sudah dilihat.' };
}

export async function storyReply({ username, text }) {
  const page = await getPage();
  await page.goto(`https://www.instagram.com/stories/${username}/`, { waitUntil: 'domcontentloaded' });
  await sleep(3500); await dismissDialogs(page);
  const box = page.locator('textarea, input[placeholder*="Reply" i], input[placeholder*="Balas" i]').first();
  if (!(await box.isVisible().catch(() => false))) return { sent: false, reason: 'Kotak reply story tidak ditemukan (mungkin tidak ada story aktif).', username };
  if (env.dryRun) return { sent: false, dryRun: true, wouldSend: text, username };
  await box.click(); await box.pressSequentially(text, { delay: 40 }); await sleep(700);
  const send = page.getByRole('button', { name: /^(send|kirim)$/i }).first();
  if (await send.isVisible().catch(() => false)) await send.click(); else await box.press('Enter');
  await sleep(1200);
  return { sent: true, username, text, via: 'story reply (masuk sebagai DM)' };
}

export async function storiesTray({ limit = 20 } = {}) {
  const page = await getPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(3000); await dismissDialogs(page);
  const stories = await page.evaluate((lim) => {
    const out = []; const seen = new Set();
    for (const a of document.querySelectorAll('a[href^="/stories/"]')) {
      const seg = a.getAttribute('href').split('/').filter(Boolean);
      if (seg[1] && !seen.has(seg[1])) { seen.add(seg[1]); out.push({ username: seg[1], url: 'https://www.instagram.com' + a.getAttribute('href') }); if (out.length >= lim) break; }
    }
    return out;
  }, limit).catch(() => []);
  return { count: stories.length, stories, note: 'Daftar akun dengan story aktif di tray beranda saat ini (urut sesuai tampilan IG).' };
}

// Buka pembuat story: klik avatar story sendiri di tray (atau "Add to your story" bila story sudah ada).
async function openStoryCreator(page) {
  const me = (await status()).signedInUser;
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2500); await dismissDialogs(page);
  const own = page.locator(`a[href^="/stories/${me}/"]`).first();
  if (await own.isVisible().catch(() => false)) { await own.click(); await sleep(2500); }
  const addMore = page.getByText(/add to your story/i).first();
  if (await addMore.isVisible().catch(() => false)) { await addMore.click(); await sleep(2000); }
  return me;
}

async function shareStory(page) {
  const share = page.getByRole('button', { name: /^(your story|add to story|share)$/i }).first();
  if (await share.isVisible().catch(() => false)) { await share.click(); await sleep(3000); return true; }
  const byText = page.getByText(/^your story$/i).first();
  if (await byText.isVisible().catch(() => false)) { await byText.click(); await sleep(3000); return true; }
  return false;
}

// Buat story: dari file gambar, atau story teks (bila IG web akun ini mendukung editor teks).
export async function storyCreate({ file, text } = {}) {
  if (!file && !text) throw new Error('Beri file gambar, atau text untuk story teks.');
  const page = await getPage();
  await openStoryCreator(page);
  if (file) {
    const input = page.locator('input[type="file"]').first();
    if (!(await input.count().catch(() => 0))) return { created: false, reason: 'Input file story tidak muncul setelah membuka pembuat story (UI IG web berubah / fitur belum tersedia untuk akun ini).' };
    await input.setInputFiles(file); await sleep(3500);
  } else {
    const aa = page.locator('svg[aria-label*="text" i], button:has-text("Aa")').first();
    if (!(await aa.isVisible().catch(() => false))) return { created: false, reason: 'Editor story teks tidak ditemukan di IG web akun ini. Story teks mungkin hanya ada di aplikasi mobile; gunakan file gambar sebagai gantinya.' };
    await aa.click(); await sleep(1500);
    const box = page.locator('textarea, div[role="textbox"][contenteditable="true"]').first();
    await box.click(); await box.pressSequentially(text, { delay: 35 }); await sleep(800);
  }
  if (env.dryRun) return { created: false, dryRun: true, prepared: file || text, note: 'Editor story terbuka; berhenti sebelum dibagikan.' };
  const shared = await shareStory(page);
  return shared ? { created: true, via: file ? 'image' : 'text', content: file || text } : { created: false, reason: 'Tombol bagikan story ("Your story") tidak ditemukan di editor.' };
}

// Buat story dengan stiker POLLING: pertanyaan + 2 pilihan (bawaan IG), di atas gambar atau teks.
export async function storyCreatePoll({ file, text, question, options = ['Yes', 'No'] } = {}) {
  if (!question) throw new Error('question wajib diisi untuk polling.');
  const opts = (options.length >= 2 ? options : ['Yes', 'No']).slice(0, 2);
  const page = await getPage();
  await openStoryCreator(page);
  if (file) {
    const input = page.locator('input[type="file"]').first();
    if (!(await input.count().catch(() => 0))) return { created: false, reason: 'Input file story tidak muncul; polling butuh story gambar di IG web.' };
    await input.setInputFiles(file); await sleep(3500);
  } else if (text) {
    const base = await storyCreate({ text });
    if (base.created === false && base.reason) return { created: false, reason: base.reason };
    return { created: false, reason: 'Polling di atas story teks belum didukung alur ini; gunakan file gambar + question.' };
  } else {
    return { created: false, reason: 'Beri file gambar untuk story polling.' };
  }
  const sticker = page.locator('svg[aria-label="Sticker"], svg[aria-label="Stickers"]').first();
  if (!(await sticker.isVisible().catch(() => false))) return { created: false, reason: 'Tombol stiker tidak ditemukan di editor story web (fitur stiker IG web terbatas per akun). Story tidak dibagikan.' };
  await sticker.click(); await sleep(1500);
  const poll = page.getByText(/^poll$/i).first();
  if (!(await poll.isVisible().catch(() => false))) return { created: false, reason: 'Stiker POLL tidak tersedia di panel stiker web akun ini. Story tidak dibagikan.' };
  await poll.click(); await sleep(1500);
  const q = page.locator('textarea[placeholder*="question" i], input[placeholder*="question" i], div[role="textbox"]').first();
  if (await q.isVisible().catch(() => false)) { await q.click(); await q.pressSequentially(question, { delay: 35 }); }
  const optInputs = page.locator('input[placeholder*="option" i], textarea[placeholder*="option" i]');
  for (let i = 0; i < opts.length; i++) {
    const oi = optInputs.nth(i);
    if (await oi.isVisible().catch(() => false)) { await oi.click(); await oi.pressSequentially(opts[i], { delay: 35 }); }
  }
  const done = page.getByRole('button', { name: /^done$/i }).first();
  if (await done.isVisible().catch(() => false)) { await done.click(); await sleep(1000); }
  if (env.dryRun) return { created: false, dryRun: true, pollPlaced: true, question, options: opts, note: 'Polling terpasang di editor; berhenti sebelum dibagikan.' };
  const shared = await shareStory(page);
  return shared ? { created: true, via: 'poll', question, options: opts } : { created: false, reason: 'Tombol bagikan story tidak ditemukan setelah polling terpasang.' };
}

// Hapus story aktif MILIK SENDIRI (yang sedang tayang).
export async function storyDelete() {
  const page = await getPage();
  const me = (await status()).signedInUser;
  if (!me) throw new Error('Tidak bisa menentukan akun login.');
  await page.goto(`https://www.instagram.com/stories/${me}/`, { waitUntil: 'domcontentloaded' });
  await sleep(3500); await dismissDialogs(page);
  if (!page.url().includes('/stories/')) return { deleted: false, reason: 'Tidak ada story aktif milik sendiri saat ini.' };
  const more = page.locator('svg[aria-label="More options"], svg[aria-label="More Options"]').first();
  if (!(await more.isVisible().catch(() => false))) return { deleted: false, reason: 'Menu opsi story tidak ditemukan.' };
  await more.click(); await sleep(1200);
  const del = page.getByRole('button', { name: /^delete/i }).first();
  if (!(await del.isVisible().catch(() => false))) { await page.keyboard.press('Escape').catch(() => {}); return { deleted: false, reason: 'Opsi Delete tidak ada di menu story.' }; }
  if (env.dryRun) { await page.keyboard.press('Escape').catch(() => {}); return { deleted: false, dryRun: true, wouldDelete: 'story aktif milik sendiri' }; }
  await del.click(); await sleep(1500);
  const confirm = page.getByRole('button', { name: /^delete$/i }).first();
  if (await confirm.isVisible().catch(() => false)) { await confirm.click(); await sleep(2000); }
  return { deleted: true, username: me };
}

// ---------- CREATE POST ----------
export async function postCreate({ files, caption = '' }) {
  if (!files?.length) throw new Error('files kosong: beri minimal 1 path gambar.');
  const page = await getPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2000); await dismissDialogs(page);
  await page.locator(S.post.newPostBtn).first().click();
  await sleep(2000);
  const input = page.locator(S.post.fileInput).first();
  await input.setInputFiles(files);
  await sleep(3000);
  // Lewati layar crop/filter dengan tombol Next (maks 2x), tanpa mengubah apa pun.
  for (let i = 0; i < 2; i++) {
    const next = page.getByRole('button', { name: /^next$/i }).first();
    if (await next.isVisible().catch(() => false)) { await next.click(); await sleep(2000); }
  }
  if (caption) {
    const cap = page.locator(S.post.captionBox).first();
    if (await cap.isVisible().catch(() => false)) { await cap.click(); await cap.fill(caption); await sleep(600); }
  }
  if (env.dryRun) return { posted: false, dryRun: true, prepared: files, caption, note: 'Berhenti sebelum Share. Set IG_DRY_RUN=false untuk benar-benar posting.' };
  const share = page.getByRole('button', { name: /^share$/i }).first();
  await share.click(); await sleep(4000);
  return { posted: true, files, caption };
}
