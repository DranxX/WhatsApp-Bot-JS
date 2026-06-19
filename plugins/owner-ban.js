// By DranxX Creative


import { areJidsSameUser } from 'baileys';
import { addBan, removeBan, listBans } from '../lib/banStore.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function parseDuration(str) {
  if (!str) return 0;
  let total = 0;
  const matches = str.matchAll(/(\d+)\s*(s|m|h|d)/gi);
  for (const m of matches) {
    const val = parseInt(m[1]);
    switch (m[2].toLowerCase()) {
      case 's': total += val; break;
      case 'm': total += val * 60; break;
      case 'h': total += val * 3600; break;
      case 'd': total += val * 86400; break;
    }
  }
  return total;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'Permanent';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

function getTarget(message, args) {
  if (message.quoted) return message.quoted.sender;
  const mentioned = message.mentionedJid?.[0];
  if (mentioned) return mentioned;
  const num = args[0]?.replace(/[^0-9]/g, '');
  if (num) return num + '@s.whatsapp.net';
  return null;
}

function getDurationArg(args) {
  for (const arg of args) {
    if (/\d+\s*(s|m|h|d)/i.test(arg)) return arg;
  }
  return null;
}

function lidToPhone(jid, groupMetadata) {
  if (!jid) return null;
  if (!jid.endsWith('@lid')) return null;
  if (groupMetadata?.participants) {
    const p = groupMetadata.participants.find(p => areJidsSameUser(p.id, jid));
    if (p?.phoneNumber) return p.phoneNumber.split(':')[0].split('@')[0];
  }
  return null;
}

function resolvePhone(jid, groupMetadata) {
  if (!jid) return null;
  if (jid.endsWith('@s.whatsapp.net')) return jid.split(':')[0].split('@')[0];
  if (jid.endsWith('@lid')) {
    const phone = lidToPhone(jid, groupMetadata);
    if (phone) return phone;
  }
  return jid.split(':')[0].split('@')[0];
}

function replyMention(sock, message, text, jids) {
  return sock.sendMessage(message.chat, {
    text,
    mentions: jids
  }, {
    quoted: message,
    ephemeralExpiration: message.contextInfo?.expiration
  });
}

function mentionTag(phoneNum) {
  return `@${phoneNum}`;
}

function phoneJid(phoneNum) {
  return phoneNum + '@s.whatsapp.net';
}

// ── Plugin ────────────────────────────────────────────────────────────────

export default {
  command: ['ban', 'unban', 'listban', 'banlist'],
  description: 'Ban/unban user dari bot',
  category: 'owner',

  handler: async (message, { commandName, args, isOwner, ownerNum, botNum, groupMetadata, sock }) => {
    if (!isOwner) return;

    // ── listban / banlist ──────────────────────────────────────────────
    if (commandName === 'listban' || commandName === 'banlist') {
      const list = listBans();
      if (!list.length) return message.reply('Tidak ada user yang di-ban.');

      const now = Date.now();
      const mentions = [];
      const text = list.map((e, i) => {
        const num = e.number || e.jid.split('@')[0];
        const jid = phoneJid(num);
        mentions.push(jid);
        const remaining = e.expiry ? formatDuration(Math.ceil((e.expiry - now) / 1000)) : 'Permanent';
        return `${i + 1}. ${mentionTag(num)}\n   Sisa: ${remaining}`;
      }).join('\n\n');

      await replyMention(sock, message, `*Banned Users:*\n\n${text}`, mentions);
      return;
    }

    // ── ban / unban ────────────────────────────────────────────────────
    const target = getTarget(message, args);
    if (!target) return message.reply('Tag/reply/ketik nomor user!');

    // LID in group: resolve to real phone via groupMetadata
    let phone = resolvePhone(target, groupMetadata);
    const isLid = target.endsWith('@lid');

    if (isLid && !phone && !groupMetadata) {
      return message.reply('Gak bisa resolve LID di group. Gunakan nomor atau @mention.');
    }
    if (isLid && !phone) {
      return message.reply('Gak bisa resolve nomor dari LID ini.');
    }

    const displayNum = phone || target.split(':')[0].split('@')[0];
    const targetNum = displayNum.replace(/\D/g, '');

    // Bypass: can't ban owner or bot
    if (targetNum === String(ownerNum || '').replace(/\D/g, '') ||
      targetNum === String(botNum || '').replace(/\D/g, '')) {
      return message.reply('Gak bisa ban owner/bot!');
    }

    const targetJid = phoneJid(displayNum);

    if (commandName === 'ban') {
      const durationArg = getDurationArg(args);
      const durationSec = parseDuration(durationArg);
      const result = addBan(target, groupMetadata, durationSec);

      const durText = durationSec > 0 ? ` selama ${formatDuration(durationSec)}` : ' permanent';
      const actionText = result.created ? 'berhasil di-ban' : 'durasi ban diperbarui';
      await replyMention(sock, message, `${mentionTag(displayNum)} ${actionText}${durText}.`, [targetJid]);
    } else if (commandName === 'unban') {
      const result = removeBan(target, groupMetadata);
      if (!result.ok) return replyMention(sock, message, `${mentionTag(displayNum)} ${result.error}`, [targetJid]);
      await replyMention(sock, message, `${mentionTag(displayNum)} berhasil di-unban.`, [targetJid]);
    }
  }
};
