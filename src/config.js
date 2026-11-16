import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = join(ROOT, '.env');
if (existsSync(p)) {
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
export const env = {
  cdpUrl: process.env.CDP_URL || 'http://127.0.0.1:9222',
  userDataDir: process.env.USER_DATA_DIR || '',
  dryRun: process.env.IG_DRY_RUN !== 'false',
  minDelayMs: Number(process.env.MIN_DELAY_MS || 2500),
  maxDelayMs: Number(process.env.MAX_DELAY_MS || 7000),
  selftestOnConnect: process.env.IG_SELFTEST_ON_CONNECT === 'true',
  selftestFull: process.env.IG_SELFTEST_FULL === 'true',
  selftestAccount: (process.env.IG_SELFTEST_ACCOUNT || '').replace(/^@/, ''),
  selftestTarget: (process.env.IG_SELFTEST_TARGET || 'instagram').replace(/^@/, ''),
  selftestDmTarget: (process.env.IG_SELFTEST_DM_TARGET || '').replace(/^@/, ''),
};
export const selectors = JSON.parse(readFileSync(join(ROOT, 'config/selectors.json'), 'utf8'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const randDelay = () => env.minDelayMs + Math.floor(Math.random() * (env.maxDelayMs - env.minDelayMs));
