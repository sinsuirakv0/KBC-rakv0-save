// lib/saveParser.js
// Python io/data.py + io/save.py + 各game/サブクラスの JS変換
import { computeSaveHash } from './crypto.js';
import { ALL_COUNTRY_CODES, CC_TO_PATCHING_CODE } from './clientInfo.js';

// ─── DataReader ──────────────────────────────────────────────────────────────

export class DataReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  readBytes(n) { const s = this.buf.slice(this.pos, this.pos + n); this.pos += n; return s; }
  readInt()    { const v = this.buf.readInt32LE(this.pos);   this.pos += 4; return v; }
  readUInt()   { const v = this.buf.readUInt32LE(this.pos);  this.pos += 4; return v; }
  readShort()  { const v = this.buf.readInt16LE(this.pos);   this.pos += 2; return v; }
  readUShort() { const v = this.buf.readUInt16LE(this.pos);  this.pos += 2; return v; }
  readByte()   { const v = this.buf.readInt8(this.pos);      this.pos += 1; return v; }
  readUByte()  { const v = this.buf.readUInt8(this.pos);     this.pos += 1; return v; }
  readDouble() { const v = this.buf.readDoubleLE(this.pos);  this.pos += 8; return v; }
  readBool()   { return this.readByte() !== 0; }
  readULong()  { const v = this.buf.readBigUInt64LE(this.pos); this.pos += 8; return Number(v); }

  readString(length = null) {
    const len = length ?? this.readInt();
    return this.readBytes(len).toString('utf-8');
  }
  readStringList(count = null) {
    const n = count ?? this.readInt();
    const r = []; for (let i = 0; i < n; i++) r.push(this.readString()); return r;
  }
  readIntList(count = null) {
    const n = count ?? this.readInt();
    const r = []; for (let i = 0; i < n; i++) r.push(this.readInt()); return r;
  }
  readBoolList(count = null) {
    const n = count ?? this.readInt();
    const r = []; for (let i = 0; i < n; i++) r.push(this.readBool()); return r;
  }
  readIntTupleList(count = null) {
    const n = count ?? this.readInt();
    const r = []; for (let i = 0; i < n; i++) r.push([this.readInt(), this.readInt()]); return r;
  }
  readIntBoolDict(count = null) {
    const n = count ?? this.readInt();
    const r = {}; for (let i = 0; i < n; i++) r[this.readInt()] = this.readBool(); return r;
  }
  readIntIntDict(count = null) {
    const n = count ?? this.readInt();
    const r = {}; for (let i = 0; i < n; i++) r[this.readInt()] = this.readInt(); return r;
  }
  readIntDoubleDict(count = null) {
    const n = count ?? this.readInt();
    const r = {}; for (let i = 0; i < n; i++) r[this.readInt()] = this.readDouble(); return r;
  }
  readVariableLengthInt() {
    let i = 0;
    for (let _ = 0; _ < 4; _++) {
      const read = this.readUByte();
      i = (i << 7) | (read & 0x7F);
      if ((read & 0x80) === 0) return i;
    }
    return i;
  }
  readDate() {
    const yr = this.readInt(), mo = this.readInt(), dy = this.readInt();
    const hr = this.readInt(), mn = this.readInt(), sc = this.readInt();
    return new Date(yr, mo - 1, dy, hr, mn, sc);
  }
  assertInt(expected) {
    const v = this.readInt();
    if (v !== expected) throw new Error(`assertInt: expected ${expected}, got ${v} at pos ${this.pos - 4}`);
  }
}

// ─── CC検出 ──────────────────────────────────────────────────────────────────

export function detectCC(buf) {
  const storedHash = buf.slice(buf.length - 32).toString('utf-8');
  for (const cc of ALL_COUNTRY_CODES) {
    if (computeSaveHash(CC_TO_PATCHING_CODE[cc], buf) === storedHash) return cc;
  }
  return null;
}

// ─── 共通ヘルパー ─────────────────────────────────────────────────────────────

// Upgrade.read: 2 ushort (plus + base) = 4 bytes total
function readUpgrade(r) { r.readShort(); r.readShort(); } // Upgrade = base(short) + plus(short)

// Cats.get_gv_cats
function getGvCats(gv) {
  const t = { 20: 203, 21: 214, 22: 231, 23: 241, 24: 249, 25: 260 };
  return t[gv] ?? null;
}
function readCatCount(r, gv) {
  const f = getGvCats(gv); return f !== null ? f : r.readInt();
}

// DST フラグ
function readDst(r, gv, isJP) { if (!isJP && gv >= 49) r.readBool(); }

// ─── 構造体スキップ関数群 ─────────────────────────────────────────────────────

// slots.py: LineUps.read
function skipLineUps(r, gv) {
  const len = gv < 90700 ? 10 : r.readUByte();
  for (let i = 0; i < len; i++) for (let j = 0; j < 10; j++) r.readInt();
}
// slots.py: LineUps.read_2
function skipLineUps2(r, gv) {
  r.readInt();
  if (gv < 90700) r.readBoolList(10); else r.readUByte();
}
// slots.py: LineUps.read_slot_names
function skipLineUpsSlotNames(r, gv) {
  const total = gv >= 110600 ? r.readUByte() : 15;
  for (let i = 0; i < total; i++) { const len = r.readInt(); r.readBytes(len); }
}

// stamp.py: StampData.read
function skipStampData(r) {
  r.readInt(); r.readIntList(30); r.readInt(); r.readInt();
}

// story.py: StoryChapters.read
function skipStoryChapters(r) {
  for (let i = 0; i < 10; i++) r.readInt();           // selected_stage
  for (let i = 0; i < 10; i++) r.readInt();           // progress
  for (let i = 0; i < 10; i++) for (let j = 0; j < 51; j++) r.readInt(); // clear_times
  for (let i = 0; i < 10; i++) for (let j = 0; j < 49; j++) r.readInt(); // treasure
}
// story.py: StoryChapters.read_treasure_festival
function skipStoryTreasureFestival(r) {
  for (let field = 0; field < 5; field++) for (let i = 0; i < 10; i++) r.readInt();
}
// story.py: StoryChapters.read_itf_timed_scores
function skipStoryItfTimedScores(r) {
  for (let i = 4; i < 7; i++) for (let j = 0; j < 51; j++) r.readInt();
}

// cat.py: Cats.read_unlocked → returns catCount
function skipCatsUnlocked(r, gv) {
  const n = readCatCount(r, gv); for (let i = 0; i < n; i++) r.readInt(); return n;
}
function skipCatsUpgrade(r, gv, n) {
  if (getGvCats(gv) === null) r.readInt(); // read & discard stream count
  for (let i = 0; i < n; i++) readUpgrade(r);
}
function skipCatsCurrentForm(r, gv, n) {
  if (getGvCats(gv) === null) r.readInt();
  for (let i = 0; i < n; i++) r.readInt();
}
function skipCatsUnlockedForms(r, gv, n) {
  if (getGvCats(gv) === null) r.readInt();
  for (let i = 0; i < n; i++) r.readInt();
}
function skipCatsGatyaSeen(r, gv, n) {
  if (getGvCats(gv) === null) r.readInt();
  for (let i = 0; i < n; i++) r.readInt();
}
function skipCatsMaxUpgradeLevels(r, gv, n) {
  if (getGvCats(gv) === null) r.readInt();
  for (let i = 0; i < n; i++) readUpgrade(r);
}
function skipCatsStorage(r, gv) {
  const total = gv < 110100 ? 100 : r.readShort();
  for (let i = 0; i < total; i++) r.readInt();
  for (let i = 0; i < total; i++) r.readInt();
}
function skipCatsCatguideCollected(r) { const n = r.readInt(); for (let i = 0; i < n; i++) r.readBool(); }
function skipCatsFourthForms(r)       { const n = r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
function skipCatsCateyesUsed(r)       { const n = r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
function skipCatsFavorites(r)         { const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readBool(); } }
function skipCatsCharaNewFlags(r)     { const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); } }
function skipCatsTalents(r) {
  const n = r.readInt();
  for (let i = 0; i < n; i++) {
    r.readInt(); const t = r.readInt();
    for (let j = 0; j < t; j++) { r.readInt(); r.readInt(); }
  }
}

// special_skill.py
function skipSpecialSkills(r)          { for (let i = 0; i < 11; i++) readUpgrade(r); }
function skipSpecialSkillsGatyaSeen(r) { for (let i = 0; i < 10; i++) r.readInt(); }
function skipSpecialSkillsMaxLevels(r) { for (let i = 0; i < 11; i++) readUpgrade(r); }

// battle_items.py
function skipBattleItems(r)       { for (let i = 0; i < 6; i++) r.readInt(); }
function skipBattleItemsLocked(r) { r.readBool(); for (let i = 0; i < 6; i++) r.readBool(); }
function skipBattleItemsEndless(r) {
  for (let i = 0; i < 6; i++) { r.readBool(); r.readBool(); r.readUByte(); r.readDouble(); r.readDouble(); }
}

// gatya.py
function skipGatyaRareNormalSeed(r, gv) {
  if (gv < 33) { r.readULong(); r.readULong(); } else { r.readUInt(); r.readUInt(); }
}
function skipGatya2(r) {
  r.readInt(); r.readInt(); r.readInt(); r.readInt(); r.readInt();
  r.readBool(); r.readBool(); r.readBool();
}
function skipGatyaTradeProgress(r) { r.readInt(); }
function skipGatyaEventSeed(r, gv) { if (gv < 33) r.readULong(); else r.readUInt(); }
function skipGatyaStepup(r) {
  const n1 = r.readInt(); for (let i = 0; i < n1; i++) { r.readInt(); r.readInt(); }
  const n2 = r.readInt(); for (let i = 0; i < n2; i++) { r.readInt(); r.readDouble(); }
}

// my_sale.py: MySale.read_bonus_hash
function skipMySale(r) {
  const n1 = r.readVariableLengthInt();
  for (let i = 0; i < n1; i++) { r.readVariableLengthInt(); r.readVariableLengthInt(); }
  const n2 = r.readVariableLengthInt();
  for (let i = 0; i < n2; i++) { r.readVariableLengthInt(); r.readByte(); }
}

// user_rank_rewards.py
function skipUserRankRewards(r, gv) {
  const total = gv >= 30 ? r.readInt() : 50;
  for (let i = 0; i < total; i++) r.readBool();
}

// item_reward_stage.py: ItemRewardChapters.read
function skipItemRewardChapters(r, gv) {
  if (gv < 20) return;
  let total, stages, stars;
  if (gv <= 33)      { total = 50;          stages = 12; stars = 3; }
  else if (gv <= 34) { total = r.readInt(); stages = 12; stars = 3; }
  else               { total = r.readInt(); stages = r.readInt(); stars = r.readInt(); }
  for (let i = 0; i < total; i++)
    for (let s = 0; s < stars; s++)
      for (let st = 0; st < stages; st++) r.readBool();
}
// item_reward_stage.py: read_item_obtains
function skipItemRewardItemObtains(r) {
  const n1 = r.readInt();
  for (let i = 0; i < n1; i++) {
    r.readInt(); const n2 = r.readInt();
    for (let j = 0; j < n2; j++) { r.readInt(); r.readBool(); }
  }
  const n3 = r.readInt(); for (let i = 0; i < n3; i++) { r.readInt(); r.readBool(); }
}

// timed_score.py: TimedScoreChapters.read
function skipTimedScoreChapters(r, gv) {
  if (gv < 20) return;
  let total, stages, stars;
  if (gv <= 33)      { total = 50;          stages = 12; stars = 3; }
  else if (gv <= 34) { total = r.readInt(); stages = 12; stars = 3; }
  else               { total = r.readInt(); stages = r.readInt(); stars = r.readInt(); }
  for (let i = 0; i < total; i++)
    for (let s = 0; s < stars; s++)
      for (let st = 0; st < stages; st++) r.readInt();
}

// officer_pass.py: OfficerPass.read
function readOfficerPass(r) { return { playTime: r.readInt() }; }

// event.py: EventChapters.read
function skipEventChapters(r, gv) {
  if (gv < 20) return;

  function readCounts(withStages) {
    if (gv > 80099) {
      const mt = r.readUByte(), sc = r.readUShort(), sp = r.readUByte();
      const stg = withStages ? r.readUByte() : 0;
      return { mt, sc, sp, stg, isInt: false };
    } else if (gv <= 32) { return { mt: 3, sc: 150, sp: 3, stg: 12, isInt: true }; }
    else if (gv <= 34)   { return { mt: 4, sc: 150, sp: 3, stg: 12, isInt: true }; }
    else {
      const mt = r.readInt(), sc = r.readInt(), sp = r.readInt();
      return { mt, sc, sp, stg: 0, isInt: true };
    }
  }
  function rv(isInt) { return isInt ? r.readInt() : r.readUShort(); }
  function readSec(p, withStg) {
    for (let m = 0; m < p.mt; m++)
      for (let sc = 0; sc < p.sc; sc++)
        for (let sp = 0; sp < p.sp; sp++) {
          if (withStg) for (let st = 0; st < p.stg; st++) rv(p.isInt);
          else rv(p.isInt);
        }
  }

  // Pass1: selected_stage
  const p1 = readCounts(true);
  readSec(p1, false);

  // Pass2: clear_progress
  let p2;
  if (gv > 80099) p2 = { ...p1 };
  else if (gv <= 32) p2 = { mt: 3, sc: 150, sp: 3, isInt: true };
  else if (gv <= 34) p2 = { mt: 4, sc: 150, sp: 3, isInt: true };
  else { const mt = r.readInt(), sc = r.readInt(), sp = r.readInt(); p2 = { mt, sc, sp, isInt: true }; }
  readSec(p2, false);

  // Pass3: stages
  let p3;
  if (gv > 80099) p3 = { ...p1 };
  else if (gv <= 32) p3 = { mt: 3, sc: 150, sp: 3, stg: 12, isInt: true };
  else if (gv <= 34) p3 = { mt: 4, sc: 150, sp: 3, stg: 12, isInt: true };
  else {
    const mt = r.readInt(), sc = r.readInt(), stg = r.readInt(), sp = r.readInt();
    p3 = { mt, sc, sp, stg, isInt: true };
  }
  readSec(p3, true);

  // Pass4: chapter_unlock_state
  let p4;
  if (gv > 80099) p4 = { ...p1 };
  else if (gv <= 32) p4 = { mt: 3, sc: 150, sp: 3, isInt: true };
  else if (gv <= 34) p4 = { mt: 4, sc: 150, sp: 3, isInt: true };
  else { const mt = r.readInt(), sc = r.readInt(), sp = r.readInt(); p4 = { mt, sc, sp, isInt: true }; }
  readSec(p4, false);
}

// event.py: EventChapters.read_legend_restrictions
function skipEventLegendRestrictions(r, gv) {
  if (gv < 20) return;
  let mt, sc;
  if (gv < 33)      { mt = 3; sc = 150; }
  else if (gv < 41) { mt = 4; sc = 150; }
  else              { mt = r.readInt(); sc = r.readInt(); }
  for (let m = 0; m < mt; m++) for (let s = 0; s < sc; s++) r.readInt();
}

// 各種補助構造体
function skipGamatoto(r) {
  r.readInt();
  const n = r.readInt();
  for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); r.readInt(); r.readInt(); }
  r.readDouble(); r.readInt();
}
function skipGamatoto2(r) { r.readInt(); r.readDouble(); r.readBool(); }
function skipGamatotoSkin(r) { r.readInt(); }
function skipItemPack(r) {
  const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readBool(); }
}
function skipItemPackDisplayedPacks(r) {
  const n = r.readInt(); for (let i = 0; i < n; i++) r.readBool();
}
function skipLoginBonus(r, gv) {
  if (gv < 40) { const n = r.readInt(); for (let i = 0; i < n; i++) r.readBool(); }
  else { const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readBool(); } }
}
function skipDojo(r) {
  const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); }
}
function skipDojoItemLocks(r) { const n = r.readInt(); for (let i = 0; i < n; i++) r.readBool(); }
function skipOutbreaks(r)  { const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); } }
function skipOutbreaks2(r) { const n = r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
function skipOutbreaksCurrentOutbreaks(r) { const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); } }
function skipSchemeItems(r) { const n = r.readInt(); for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); } }
function skipUnlockPopups(r) { const n = r.readInt(); for (let i = 0; i < n; i++) r.readBool(); }
function skipOtoto(r) {
  const n = r.readInt();
  for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); r.readDouble(); }
  r.readDouble();
}
function skipOtoto2(r, gv) {
  r.readInt();
  if (gv >= 50) { const n = r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
  r.readDouble();
}
function skipExChapters(r) {
  const n = r.readInt();
  for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); r.readBool(); }
}
function skipBeaconBase(r) {
  const n = r.readInt();
  for (let i = 0; i < n; i++) { r.readInt(); r.readInt(); r.readBool(); }
}

// ─── メインパーサー ───────────────────────────────────────────────────────────

export function parseSaveFile(buf) {
  const L = (msg) => console.log(msg); // ログ短縮
  const peek = (r) => r.buf.readInt32LE(r.pos);

  const cc = detectCC(buf);
  if (!cc) throw new Error('国コードを検出できませんでした。セーブファイルが正しいか確認してください。');

  const r = new DataReader(buf);
  const isJP = cc === 'jp';
  const notJP = !isJP;
  const gv = r.readInt();
  L('01 gv='+gv+' cc='+cc+' pos='+r.pos);

  if (gv >= 10 || notJP) r.readBool();
  r.readBool(); r.readBool();
  const catfood = r.readInt();
  r.readInt();
  L('02 after flags+catfood pos='+r.pos);

  r.readInt(); r.readInt(); r.readInt(); r.readInt(); r.readInt(); r.readInt();
  r.readDouble();
  r.readInt(); r.readInt(); r.readInt();
  readDst(r, gv, isJP);
  L('03 after date/time pos='+r.pos);

  r.readInt(); r.readInt(); r.readInt();
  r.readInt(); r.readInt(); r.readInt();
  r.readInt(); r.readInt();
  r.readIntList(3);
  r.readInt(); r.readInt(); r.readInt();
  r.readBool();
  r.readInt(); r.readInt(); r.readInt(); r.readInt();
  L('04 after misc ints pos='+r.pos);

  skipLineUps(r, gv);       L('05 after LineUps pos='+r.pos);
  skipStampData(r);          L('06 after StampData pos='+r.pos);
  skipStoryChapters(r);      L('07 after StoryChapters pos='+r.pos);

  if (gv >= 20 && gv <= 25) r.readIntList(231); else r.readIntList();
  L('08 after enemy_guide pos='+r.pos);

  const catCount = skipCatsUnlocked(r, gv);
  L('09 after CatsUnlocked catCount='+catCount+' pos='+r.pos);
  skipCatsUpgrade(r, gv, catCount);
  L('10 after CatsUpgrade pos='+r.pos);
  skipCatsCurrentForm(r, gv, catCount);
  L('11 after CatsCurrentForm pos='+r.pos);
  skipSpecialSkills(r);
  L('12 after SpecialSkills pos='+r.pos+' peek='+peek(r));

  if (gv <= 25)       { r.readIntList(5); r.readIntList(5); }
  else if (gv === 26) { r.readIntList(6); r.readIntList(6); }
  else                { r.readIntList();  r.readIntList(); }
  L('13 after menu_unlocks pos='+r.pos);

  skipBattleItems(r);
  L('14 after BattleItems pos='+r.pos);
  if (gv <= 26) r.readIntList(17); else r.readIntList();
  L('15 after new_dialogs pos='+r.pos);

  r.readIntList(20); r.readIntList(1); r.readIntList(1);
  skipBattleItemsLocked(r);
  L('16 after BattleItemsLocked pos='+r.pos);

  readDst(r, gv, isJP);
  r.readDate();
  L('17 after date_2 pos='+r.pos);
  skipStoryTreasureFestival(r);
  L('18 after TreasureFestival pos='+r.pos);
  readDst(r, gv, isJP);
  r.readDate();
  L('19 after date_3 pos='+r.pos);

  if (gv <= 37) r.readInt();
  r.readInt(); r.readInt(); r.readInt(); r.readInt(); r.readInt(); r.readInt();
  r.readString();
  L('20 after save_data_4_hash pos='+r.pos);

  skipMySale(r);
  L('21 after MySale pos='+r.pos);
  r.readIntList(2);

  if (gv <= 37) { r.readInt(); r.readBool(); }
  r.readIntList(2);
  L('22 after chara_flags pos='+r.pos);

  const normalTickets = r.readInt();
  const rareTickets   = r.readInt();
  L('23 after tickets pos='+r.pos);

  skipCatsGatyaSeen(r, gv, catCount);
  L('24 after CatsGatyaSeen pos='+r.pos);
  skipSpecialSkillsGatyaSeen(r);
  L('25 after SpecialSkillsGatyaSeen pos='+r.pos);
  skipCatsStorage(r, gv);
  L('26 after CatsStorage pos='+r.pos);
  skipEventChapters(r, gv);
  L('27 after EventChapters pos='+r.pos);

  r.readInt(); r.readInt();
  if (gv >= 20)             r.readIntList(36);
  if (gv >= 20 && gv <= 25) r.readIntList(110);
  else if (gv >= 26)        r.readIntList();
  L('28 after unlock_popups_8/unit_drops pos='+r.pos);

  skipGatyaRareNormalSeed(r, gv);
  r.readBool();
  r.readBoolList(7);
  r.readInt();
  L('29 after gatya_seed/achievements pos='+r.pos);

  readDst(r, gv, isJP);
  r.readDate();
  L('30 after date_4 pos='+r.pos);
  skipGatya2(r);
  L('31 after gatya2 pos='+r.pos);

  if (notJP) r.readString();
  r.readStringList();
  L('32 after order_ids pos='+r.pos);

  if (notJP) {
    r.readDouble(); r.readDouble(); r.readDouble();
    r.readStringList(); r.readBool(); r.readInt();
  }
  L('33 after notJP_block pos='+r.pos);

  skipLineUps2(r, gv);
  L('34 after LineUps2 pos='+r.pos);
  skipEventLegendRestrictions(r, gv);
  L('35 after LegendRestrictions pos='+r.pos);

  if (gv <= 37) { r.readIntList(7); r.readIntList(7); r.readIntList(7); }

  r.readDouble(); r.readDouble(); r.readDouble(); r.readDouble();
  skipGatyaTradeProgress(r);
  L('36 after tradeProgress pos='+r.pos);

  if (gv <= 37) r.readStringList();
  if (notJP) r.readDouble(); else r.readInt();
  L('37 after getTimeSave2 pos='+r.pos);

  if (gv >= 20 && gv <= 25)      r.readBoolList(12);
  else if (gv >= 26 && gv < 39)  r.readBoolList();
  L('38 after boollist pos='+r.pos);

  skipCatsMaxUpgradeLevels(r, gv, catCount);
  L('39 after CatsMaxUpgradeLevels pos='+r.pos);
  skipSpecialSkillsMaxLevels(r);
  L('40 after SpecialSkillsMaxLevels pos='+r.pos);
  skipUserRankRewards(r, gv);
  L('41 after UserRankRewards pos='+r.pos);
  if (!notJP) r.readDouble();
  skipCatsUnlockedForms(r, gv, catCount);
  L('42 after CatsUnlockedForms pos='+r.pos);

  L('43 before transfer_code pos='+r.pos+' peek='+peek(r));
  // 80バイト詳細ダンプ
  {
    const _dp = r.pos;
    const _hexArr = [];
    for (let _i = 0; _i < 80; _i++) _hexArr.push(r.buf[_dp+_i].toString(16).padStart(2,'0'));
    L('DUMP80: '+_hexArr.join(' '));
    // 各オフセットでint解釈
    for (let _off = 0; _off <= 16; _off += 4) {
      const _v = r.buf.readInt32LE(_dp + _off);
      L('  int@+'+_off+'='+_v);
    }
    // ASCII文字列の候補を探す（長さ1-30のところ）
    for (let _off = 0; _off <= 20; _off++) {
      const _len = r.buf.readInt32LE(_dp + _off);
      if (_len > 0 && _len <= 30) {
        const _str = r.buf.slice(_dp+_off+4, _dp+_off+4+_len).toString('utf-8');
        L('  candidate string @+'+_off+' len='+_len+' val="'+_str+'"');
      }
    }
  }
  // 安全に読む（長すぎたらスキップ）
  try {
    const _tc_len = r.buf.readInt32LE(r.pos);
    if (_tc_len >= 0 && _tc_len <= 200) {
      r.readString();
    } else {
      r.readInt(); // lengthだけ消費
      L('43w transfer_code len='+_tc_len+' skipped');
    }
    const _cc_len = r.buf.readInt32LE(r.pos);
    if (_cc_len >= 0 && _cc_len <= 200) {
      r.readString();
    } else {
      r.readInt();
      L('43w confirmation_code len='+_cc_len+' skipped');
    }
    r.readBool();
    L('44 after transfer_fields pos='+r.pos);
  } catch(e) {
    L('44 transfer_fields error: '+e.message+' pos='+r.pos);
  }

  let inquiryCode = '', playTime = 0;

  if (gv >= 20) {
    L('45 before ItemRewardChapters pos='+r.pos+' peek='+peek(r));
    skipItemRewardChapters(r, gv);
    L('46 after ItemRewardChapters pos='+r.pos);
    skipTimedScoreChapters(r, gv);
    L('47 after TimedScoreChapters pos='+r.pos+' peek='+peek(r));
    inquiryCode = r.readString();
    L('48 inquiryCode='+inquiryCode+' pos='+r.pos);
    const op = readOfficerPass(r);
    playTime = op.playTime;
    L('49 playTime='+playTime+' pos='+r.pos);
    r.readByte(); r.readInt();
    if (notJP) r.readBool();
    L('50 before assertInt(44) pos='+r.pos+' peek='+peek(r));
    r.assertInt(44);
    r.readInt();
    skipStoryItfTimedScores(r);
    r.readInt();
    if (gv > 26) r.readIntList();
    r.readBool();
    L('51 before assertInt(45) pos='+r.pos+' peek='+peek(r));
    r.assertInt(45);
  }
  if (gv >= 21) {
    L('52 before assertInt(46) pos='+r.pos+' peek='+peek(r));
    r.assertInt(46);
    skipGatyaEventSeed(r, gv);
    if (gv < 34) { r.readIntList(100); r.readIntList(100); }
    else         { r.readIntList();    r.readIntList(); }
    L('53 before assertInt(47) pos='+r.pos+' peek='+peek(r));
    r.assertInt(47);
  }
  if (gv >= 22) { L('54 before assertInt(48) pos='+r.pos+' peek='+peek(r)); r.assertInt(48); }
  if (gv >= 23) {
    if (!notJP) r.readBool();
    r.readDouble();
    if (gv < 26) r.readIntList(44); else r.readIntList();
    r.readBool(); r.readBoolList(3); r.readDouble(); r.readBoolList(3); r.readInt();
    L('55 before assertInt(49) pos='+r.pos+' peek='+peek(r));
    r.assertInt(49);
  }
  if (gv >= 24) { L('56 before assertInt(50) pos='+r.pos+' peek='+peek(r)); r.assertInt(50); }
  if (gv >= 25) { L('57 before assertInt(51) pos='+r.pos+' peek='+peek(r)); r.assertInt(51); }
  if (gv >= 26) {
    skipCatsCatguideCollected(r);
    L('58 before assertInt(52) pos='+r.pos+' peek='+peek(r));
    r.assertInt(52);
  }
  if (gv >= 27) {
    r.readDouble(); r.readDouble(); r.readDouble(); r.readDouble(); r.readDouble();
    L('59 after 5xDouble pos='+r.pos);
    r.readIntList(); skipCatsFourthForms(r); skipCatsCateyesUsed(r);
    r.readIntList(); r.readIntList();
    L('60 after catfruit/catseyes pos='+r.pos);
    skipGamatoto(r);
    L('61 after Gamatoto pos='+r.pos);
    r.readBoolList();
    skipExChapters(r);
    L('62 before assertInt(53) pos='+r.pos+' peek='+peek(r));
    r.assertInt(53);
  }
  if (gv >= 29) {
    skipGamatoto2(r);
    L('63 before assertInt(54) pos='+r.pos+' peek='+peek(r));
    r.assertInt(54);
    skipItemPack(r);
    L('64 before assertInt(54) pos='+r.pos+' peek='+peek(r));
    r.assertInt(54);
  }
  if (gv >= 30) {
    skipGamatotoSkin(r);
    r.readInt(); // platinum_tickets
    skipLoginBonus(r, gv);
    L('65 after LoginBonus pos='+r.pos);
    if (gv < 101000) r.readBoolList();
    r.readDouble(); r.readDouble();
    r.readIntTupleList(16);
    r.readInt(); r.readInt(); r.readInt(); r.readInt();
    L('66 before assertInt(55) pos='+r.pos+' peek='+peek(r));
    r.assertInt(55);
  }
  if (gv >= 31) {
    r.readBool(); skipItemRewardItemObtains(r); skipGatyaStepup(r); r.readInt();
    L('67 before assertInt(56) pos='+r.pos+' peek='+peek(r));
    r.assertInt(56);
  }
  if (gv >= 32) {
    r.readBool(); skipCatsFavorites(r);
    L('68 before assertInt(57) pos='+r.pos+' peek='+peek(r));
    r.assertInt(57);
  }
  if (gv >= 33) {
    skipDojo(r); skipDojoItemLocks(r);
    L('69 before assertInt(58) pos='+r.pos+' peek='+peek(r));
    r.assertInt(58);
  }
  if (gv >= 34) {
    r.readDouble(); skipOutbreaks(r); skipOutbreaks2(r); skipSchemeItems(r);
    L('70 after gv34 block pos='+r.pos);
  }

  let energyPenaltyTimestamp = 0;
  if (gv >= 35) {
    skipOutbreaksCurrentOutbreaks(r);
    r.readIntBoolDict();
    energyPenaltyTimestamp = r.readDouble();
    L('71 before assertInt(60) pos='+r.pos+' peek='+peek(r));
    r.assertInt(60);
  }
  if (gv >= 36) {
    skipCatsCharaNewFlags(r); r.readBool(); skipItemPackDisplayedPacks(r);
    L('72 before assertInt(61) pos='+r.pos+' peek='+peek(r));
    r.assertInt(61);
  }
  if (gv >= 38) {
    skipUnlockPopups(r);
    L('73 before assertInt(63) pos='+r.pos+' peek='+peek(r));
    r.assertInt(63);
  }
  if (gv >= 39) {
    skipOtoto(r); skipOtoto2(r, gv); r.readDouble();
    L('74 before assertInt(64) pos='+r.pos+' peek='+peek(r));
    r.assertInt(64);
  }
  L('75 before _parseLaterSections pos='+r.pos);

  const late = _parseLaterSections(r, gv, notJP);

  return {
    cc, gameVersion: gv, inquiryCode,
    energyPenaltyTimestamp,
    passwordRefreshToken: late.passwordRefreshToken,
    playTime, userRank: 0,
    catfood, rareTickets,
    platinumTickets: late.platinumTickets,
    legendTickets: late.legendTickets,
    rawBytes: buf,
  };
}

// ─── gv>=40 以降の後半セクション ─────────────────────────────────────────────

function _parseLaterSections(r, gv, notJP) {
  let passwordRefreshToken = '', legendTickets = 0, platinumTickets = 0;
  try {
    if (gv >= 40) {
      r.readBool(); r.readBool();
      const nm = r.readInt();
      for (let i = 0; i < nm; i++) { r.readInt(); r.readInt(); r.readBool(); }
      r.assertInt(65);
    }
    if (gv >= 41) {
      r.readInt();
      const nc = r.readInt(); for (let i = 0; i < nc; i++) r.readBool();
      r.assertInt(66);
    }
    if (gv >= 43) {
      const nm = r.readInt(); for (let i = 0; i < nm; i++) { r.readInt(); r.readInt(); }
      r.assertInt(67);
    }
    if (gv >= 45) {
      for (let set = 0; set < 2; set++) {
        const n = r.readInt();
        for (let i = 0; i < n; i++) { const ns = r.readInt(); for (let j = 0; j < ns; j++) r.readInt(); }
      }
      r.assertInt(68);
    }
    if (gv >= 50) { r.readInt(); r.assertInt(69); }
    if (gv >= 52) {
      const nt = r.readInt(); for (let i = 0; i < nt; i++) { r.readInt(); r.readInt(); }
      r.assertInt(70);
    }
    if (gv >= 70000) { skipBeaconBase(r); r.assertInt(70000); }
    if (gv >= 80000) {
      const nt = r.readInt(); for (let i = 0; i < nt; i++) r.readInt();
      r.assertInt(80000);
    }
    if (gv >= 80100) {
      const nm = r.readInt(); for (let i = 0; i < nm; i++) { r.readInt(); r.readInt(); r.readInt(); }
      r.assertInt(80100);
    }
    if (gv >= 80200) {
      r.readBool(); r.readShort(); r.readShort(); r.readShort();
      r.assertInt(80200);
    }
    if (gv >= 80300) { r.readByte(); r.readBool(); r.assertInt(80300); }
    if (gv >= 80500) { r.readIntList(); r.assertInt(80500); }
    if (gv >= 80600) {
      const n = r.readShort(); r.readIntList(n);
      const nlq = r.readInt(); for (let i = 0; i < nlq; i++) { r.readInt(); r.readBool(); }
      r.readShort(); r.readByte();
      r.assertInt(80600);
    }
    if (gv >= 80700) {
      const n = r.readInt();
      for (let i = 0; i < n; i++) { r.readInt(); r.readIntList(); }
      r.assertInt(80700);
    }
    if (gv >= 100600 && notJP) { r.readByte(); r.assertInt(100600); }
    if (gv >= 81000) { r.readByte(); r.assertInt(81000); }
    if (gv >= 90000) {
      const nm = r.readInt(); for (let i = 0; i < nm; i++) r.readBool();
      const ngs = r.readInt(); for (let i = 0; i < ngs; i++) { r.readInt(); r.readInt(); }
      r.assertInt(90000);
    }
    if (gv >= 90100) { r.readShort(); r.readShort(); r.readInt(); r.readDouble(); r.assertInt(90100); }
    if (gv >= 90300) {
      const n = r.readShort();
      for (let i = 0; i < n; i++) {
        r.readInt(); r.readInt(); r.readShort(); r.readInt(); r.readInt(); r.readInt(); r.readShort();
      }
      const nd = r.readShort(); for (let i = 0; i < nd; i++) { r.readInt(); r.readDouble(); }
      const ng = r.readInt(); for (let i = 0; i < ng; i++) r.readBool();
      r.assertInt(90300);
    }
    if (gv >= 90400) {
      const ne = r.readInt(); for (let i = 0; i < ne; i++) r.readBool();
      const ne2 = r.readInt(); for (let i = 0; i < ne2; i++) { r.readInt(); r.readInt(); }
      const ncs = r.readInt(); for (let i = 0; i < ncs; i++) r.readBool();
      r.assertInt(90400);
    }
    if (gv >= 90500) {
      const ncg = r.readInt(); for (let i = 0; i < ncg; i++) r.readBool();
      r.readBool(); r.readDouble(); r.readDouble(); r.readInt();
      if (gv >= 100300) { r.readByte(); r.readBool(); r.readDouble(); r.readDouble(); }
      if (gv >= 130700) {
        const n1 = r.readShort(); for (let i = 0; i < n1; i++) { r.readInt(); r.readByte(); }
        const n2 = r.readShort(); for (let i = 0; i < n2; i++) { r.readInt(); r.readDouble(); }
      }
      if (gv >= 140100) { const n3 = r.readShort(); for (let i = 0; i < n3; i++) { r.readInt(); r.readDouble(); } }
      r.assertInt(90500);
    }
    if (gv >= 90700) {
      const nt = r.readInt(); for (let i = 0; i < nt; i++) { r.readInt(); r.readInt(); }
      const nu = r.readShort();
      for (let i = 0; i < nu; i++) {
        r.readShort(); const nb = r.readByte();
        for (let j = 0; j < nb; j++) { r.readByte(); r.readShort(); }
      }
      r.assertInt(90700);
    }
    if (gv >= 90800) { r.readInt(); r.readInt(); r.assertInt(90800); }
    if (gv >= 90900) {
      const ns = r.readInt(); for (let i = 0; i < ns; i++) { r.readInt(); r.readInt(); }
      r.readDouble(); r.readDouble();
      r.assertInt(90900);
    }
    if (gv >= 91000) { skipLineUpsSlotNames(r, gv); r.assertInt(91000); }
    if (gv >= 100000) {
      legendTickets = r.readInt();
      const n = r.readUByte();
      for (let i = 0; i < n; i++) { r.readUByte(); r.readInt(); }
      r.readBool(); r.readBool();
      passwordRefreshToken = r.readString();
      r.readBool(); r.readUByte(); r.readUByte(); r.readDouble(); r.readDouble();
      r.assertInt(100000);
    }
    if (gv >= 100100) { r.readInt(); r.assertInt(100100); }
    if (gv >= 100300) { skipBattleItemsEndless(r); r.assertInt(100300); }
    if (gv >= 100400) {
      const n = r.readUByte(); r.readIntList(n); r.readBool();
      r.assertInt(100400);
    }
    if (gv >= 100600) {
      r.readDouble();
      platinumTickets = r.readInt();
      r.assertInt(100600);
    }
  } catch (e) {
    console.warn('Late section parse warning (non-fatal):', e.message);
  }
  return { passwordRefreshToken, legendTickets, platinumTickets };
}
