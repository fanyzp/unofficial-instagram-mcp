#!/usr/bin/env node
import { runSelfTest, SELFTEST_WARNING } from './selftest.js';

// Runner CLI self-test: node src/run-selftest.js [safe|full]
// Level full punya gerbang keras di selftest.js dan hanya untuk akun kedua.
const level = process.argv[2] === 'full' ? 'full' : 'safe';
console.log(`Menjalankan self-test level ${level}...`);
console.log(SELFTEST_WARNING);
const r = await runSelfTest({ level });
console.log(JSON.stringify(r, null, 2));
process.exit(r.ran && r.failed > 0 ? 1 : 0);
