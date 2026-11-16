import { chromium } from 'playwright-core';
import { env } from './config.js';

// Satu koneksi browser untuk seluruh proses (server MCP / CLI / TUI).
// TIDAK ADA login pakai password: nempel ke Chrome yang sudah login via CDP,
// atau profil persisten milik sendiri (login manual sekali oleh pemilik akun).
let cached = null;

export async function getPage() {
  if (cached?.page && !cached.page.isClosed()) return cached.page;
  let ctx;
  if (!env.userDataDir) {
    const browser = await chromium.connectOverCDP(env.cdpUrl);
    ctx = browser.contexts()[0];
    if (!ctx) throw new Error('CDP tersambung tapi tidak ada context. Buka 1 tab Chrome dulu.');
  } else {
    ctx = await chromium.launchPersistentContext(env.userDataDir, { headless: false, viewport: { width: 1600, height: 950 } });
  }
  const page = ctx.pages().find((p) => p.url().includes('instagram.com')) || (await ctx.newPage());
  await page.setViewportSize({ width: 1920, height: 1000 }).catch(() => {});
  cached = { ctx, page };
  return page;
}

export async function dismissDialogs(page) {
  for (const label of ['Not now', 'Not Now', 'Nanti saja', 'Jangan sekarang']) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.first().isVisible().catch(() => false)) await btn.first().click().catch(() => {});
  }
}
