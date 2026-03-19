// api/parse.js
import { parseSaveFile } from './_lib/saveParser.js';
import { computeSaveHash } from './_lib/crypto.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body;
  try {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  } catch {
    return res.status(400).json({ error: 'ファイルの読み取りに失敗' });
  }

  // ハッシュデバッグ: 末尾32バイトと各CCの計算値を比較
  const storedHash = body.slice(body.length - 32).toString('utf-8');
  const hashDebug = {};
  for (const cc of ['jp', 'en', 'kr', 'tw']) {
    const computed = computeSaveHash(cc, body);
    hashDebug[cc] = { computed, match: computed === storedHash };
  }

  try {
    const d = parseSaveFile(body);
    return res.status(200).json({
      success: true,
      cc: d.cc,
      gameVersion: d.gameVersion,
      inquiryCode: d.inquiryCode,
      energyPenaltyTimestamp: d.energyPenaltyTimestamp,
      passwordRefreshToken: d.passwordRefreshToken
        ? d.passwordRefreshToken.slice(0, 8) + '...' : '(空)',
      playTime: d.playTime,
      catfood: d.catfood,
      rareTickets: d.rareTickets,
      platinumTickets: d.platinumTickets,
      legendTickets: d.legendTickets,
      fileSizeBytes: body.length,
      _hashDebug: { storedHash, hashDebug },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e.message,
      _hashDebug: { storedHash, hashDebug },
    });
  }
}
