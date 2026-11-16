import { env } from './config.js';
import * as ig from './instagram.js';

// DM WATCHER: deteksi pesan DM BARU secara proaktif, supaya AI agent bisa
// "tahu sendiri" ada pesan masuk tanpa disuruh polling manual.
//
// Kenapa dua lapis:
// - Snapshot inbox (dmInboxSnapshot) itu MURAH (baca DOM daftar thread, tanpa
//   klik), tapi sifatnya heuristik: cukup untuk jadi PEMICU, bukan kebenaran.
// - Verifikasi (dmCheck) itu MAHAL (klik-scan, bisa menandai thread terbaca),
//   tapi akurat. Ia hanya jalan saat snapshot berubah, dibatasi cooldown,
//   dan hanya thread terverifikasi "perlu dibalas" yang jadi event.
//
// Aturan main (sama seperti ig-dm-ai):
// - BASELINE: snapshot + verifikasi pertama hanya mencatat keadaan awal;
//   pesan lama TIDAK PERNAH jadi event. Hanya pesan yang datang setelah
//   watcher jalan yang dilaporkan.
// - DEDUPE: fingerprint threadId|pesan terakhir; event yang sama tidak
//   pernah dipancarkan dua kali.
// - Event masuk antrean (cincin, maks 100) untuk diambil lewat tool
//   dm_events, DAN dipancarkan ke subscriber (server MCP meneruskannya
//   sebagai notifikasi notifications/message ber-logger "dm-watch").

const SPAM_LINK_ONLY = /^\s*(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?\s*$/i;
const SPAM_PROMO = /(giveaway|promo code|kode promo|\$\s?\d[\d,.]*\s?(bonus|gratis)|casino|judi|slot gacor)/i;

// Klasifikasi spam sederhana (pola yang sama dengan ig-dm-ai brain.js).
export function isLikelySpam(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (SPAM_LINK_ONLY.test(t)) return true;
  if (SPAM_PROMO.test(t)) return true;
  return false;
}

const fingerprint = (t) => `${t.threadId}|${(t.lastMessage || '').trim()}`;

export class DmWatcher {
  // detect/verify bisa disuntik untuk pengujian; default-nya fungsi asli
  // dari instagram.js.
  constructor({ snapshot, verify, onEvent, intervalMs, verifyCooldownMs, limit } = {}) {
    this._snapshot = snapshot || (() => ig.dmInboxSnapshot());
    this._verify = verify || ((lim) => ig.dmCheck({ limit: lim }));
    this._onEvent = onEvent || (() => {});
    this.intervalMs = Math.max(15000, intervalMs || env.watchIntervalMs || 60000);
    this.verifyCooldownMs = verifyCooldownMs ?? 45000;
    this.limit = limit || env.watchLimit || 8;
    this.running = false;
    this.timer = null;
    this.polling = false;
    this.startedAt = null;
    this.lastPollAt = null;
    this.lastVerifyAt = 0;
    this.lastError = null;
    this.signedInUser = undefined; // undefined = belum tahu
    this._baselineDone = false;
    this._snapshotSig = null;
    this._known = new Set(); // fingerprint yang sudah jadi baseline / sudah di-event-kan
    this._events = [];
    this._nextId = 1;
    this._state = 'idle'; // idle | baselining | watching | signed_out | error
    this._lastStateEmitted = null;
  }

  status() {
    return {
      running: this.running,
      state: this._state,
      intervalMs: this.intervalMs,
      startedAt: this.startedAt,
      lastPollAt: this.lastPollAt,
      baselineDone: this._baselineDone,
      signedInUser: this.signedInUser ?? null,
      pendingEvents: this._events.length,
      lastError: this.lastError,
    };
  }

  eventsSince(sinceId = 0, limit = 50) {
    const evs = this._events.filter((e) => e.id > sinceId);
    return { events: evs.slice(0, limit), cursor: evs.length ? evs[evs.length - 1].id : sinceId, total: evs.length };
  }

  _emit(event) {
    const full = { id: this._nextId++, detectedAt: new Date().toISOString(), ...event };
    this._events.push(full);
    if (this._events.length > 100) this._events.splice(0, this._events.length - 100);
    try { this._onEvent(full); } catch { /* subscriber tidak boleh menjatuhkan watcher */ }
    return full;
  }

  _emitState(state, detail = {}) {
    if (this._lastStateEmitted === state && state !== 'error') return;
    this._lastStateEmitted = state;
    this._emit({ type: 'watcher_state', state, ...detail });
  }

  async start() {
    if (this.running) return this.status();
    this.running = true;
    this.startedAt = new Date().toISOString();
    this._state = 'baselining';
    await this._poll().catch(() => {});
    this.timer = setInterval(() => { this._poll().catch(() => {}); }, this.intervalMs);
    this.timer.unref?.();
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this._state = 'idle';
    return this.status();
  }

  async _poll() {
    if (this.polling || !this.running) return;
    this.polling = true;
    try {
      const snap = await this._snapshot();
      this.lastPollAt = new Date().toISOString();
      this.lastError = null;
      if (!snap || snap.signedIn === false) {
        this.signedInUser = null;
        this._state = 'signed_out';
        this._emitState('signed_out', { reason: 'Browser belum login Instagram; watcher menunggu.' });
        return;
      }
      this.signedInUser = snap.signedInUser ?? this.signedInUser ?? null;
      const sig = (snap.rows || []).map((r) => `${r.key}:${r.preview}:${r.unread ? 1 : 0}`).join('\n');
      if (!this._baselineDone) {
        // Baseline: verifikasi sekali untuk mencatat fingerprint awal.
        const v = await this._verify(this.limit).catch(() => null);
        if (v?.needsReply) for (const t of v.needsReply) this._known.add(fingerprint(t));
        this._snapshotSig = sig;
        this._baselineDone = true;
        this._state = 'watching';
        this._emitState('baseline', { note: 'Keadaan inbox awal tercatat; hanya pesan baru setelah ini yang dilaporkan.' });
        return;
      }
      this._state = 'watching';
      if (sig === this._snapshotSig) return; // tidak ada perubahan terlihat
      this._snapshotSig = sig;
      // Ada perubahan: verifikasi, dibatasi cooldown.
      const now = Date.now();
      if (now - this.lastVerifyAt < this.verifyCooldownMs) return;
      this.lastVerifyAt = now;
      const v = await this._verify(this.limit);
      for (const t of v?.needsReply || []) {
        const fp = fingerprint(t);
        if (this._known.has(fp)) continue;
        this._known.add(fp);
        this._emit({
          type: 'dm_new_message',
          threadId: String(t.threadId),
          username: t.username || '',
          name: t.name || '',
          text: t.lastMessage || '',
          spam: isLikelySpam(t.lastMessage || ''),
        });
      }
    } catch (e) {
      this.lastError = e.message;
      this._state = 'error';
      this._emitState('error', { reason: e.message });
    } finally {
      this.polling = false;
    }
  }
}

// Singleton untuk server MCP + tool: satu watcher per proses server.
let shared = null;
export function getWatcher(onEvent) {
  if (!shared) shared = new DmWatcher({ onEvent });
  else if (onEvent) shared._onEvent = onEvent;
  return shared;
}
