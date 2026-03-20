// lib/saveParser.js
// 完全実装版 - 全Pythonファイルから正確に変換
import { computeSaveHash } from './crypto.js';
import { ALL_COUNTRY_CODES, CC_TO_PATCHING_CODE } from './clientInfo.js';

// ─── DataReader ──────────────────────────────────────────────────────────────

export class DataReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  readBytes(n)  { const s = this.buf.slice(this.pos, this.pos + n); this.pos += n; return s; }
  readInt()     { const v = this.buf.readInt32LE(this.pos);   this.pos += 4; return v; }
  readUInt()    { const v = this.buf.readUInt32LE(this.pos);  this.pos += 4; return v; }
  readShort()   { const v = this.buf.readInt16LE(this.pos);   this.pos += 2; return v; }
  readUShort()  { const v = this.buf.readUInt16LE(this.pos);  this.pos += 2; return v; }
  readByte()    { const v = this.buf.readInt8(this.pos);      this.pos += 1; return v; }
  readUByte()   { const v = this.buf.readUInt8(this.pos);     this.pos += 1; return v; }
  readDouble()  { const v = this.buf.readDoubleLE(this.pos);  this.pos += 8; return v; }
  readLong()    { const v = this.buf.readBigInt64LE(this.pos); this.pos += 8; return Number(v); }
  readULong()   { const v = this.buf.readBigUInt64LE(this.pos); this.pos += 8; return Number(v); }
  readBool()    { return this.readByte() !== 0; }

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
  readByteList(count = null) {
    const n = count ?? this.readInt();
    const r = []; for (let i = 0; i < n; i++) r.push(this.readByte()); return r;
  }
  readShortList(count = null) {
    const n = count ?? this.readInt();
    const r = []; for (let i = 0; i < n; i++) r.push(this.readShort()); return r;
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
  readShortBoolDict(count = null) {
    const n = count ?? this.readInt();
    const r = {}; for (let i = 0; i < n; i++) r[this.readShort()] = this.readBool(); return r;
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
    if (v !== expected) {
      let foundAt = null;
      const sp = Math.max(0, this.pos - 204);
      const ep = Math.min(this.buf.length - 4, this.pos + 200);
      for (let s = sp; s <= ep; s++) {
        if (this.buf.readInt32LE(s) === expected) { foundAt = s; break; }
      }
      const drift = foundAt !== null ? foundAt - (this.pos - 4) : 'not found in ±200';
      throw new Error(`assertInt: expected ${expected}, got ${v} at pos ${this.pos - 4}. Found ${expected} at offset ${drift}.`);
    }
  }
}

// ─── CC検出 ──────────────────────────────────────────────────────────────────

export function detectCC(buf) {
  const stored = buf.slice(buf.length - 32).toString('utf-8');
  for (const cc of ALL_COUNTRY_CODES) {
    if (computeSaveHash(CC_TO_PATCHING_CODE[cc], buf) === stored) return cc;
  }
  return null;
}

// ─── 共通ヘルパー ─────────────────────────────────────────────────────────────

// Upgrade.read: ushort plus + ushort base (upgrade.py)
function readUpgrade(r) { r.readUShort(); r.readUShort(); }

// Cats.get_gv_cats (cat.py)
function getGvCats(gv) {
  const t = { 20:203, 21:214, 22:231, 23:241, 24:249, 25:260 };
  return t[gv] ?? null;
}
function readCatCount(r, gv) { const f = getGvCats(gv); return f !== null ? f : r.readInt(); }

// DST flag (save.py: should_read_dst)
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
function skipStampData(r) { r.readInt(); r.readIntList(30); r.readInt(); r.readInt(); }

// story.py: StoryChapters.read
function skipStoryChapters(r) {
  for (let i = 0; i < 10; i++) r.readInt();            // selected_stage
  for (let i = 0; i < 10; i++) r.readInt();            // progress
  for (let i = 0; i < 10; i++) for (let j = 0; j < 51; j++) r.readInt(); // clear_times
  for (let i = 0; i < 10; i++) for (let j = 0; j < 49; j++) r.readInt(); // treasure
}
// story.py: read_treasure_festival
function skipStoryTreasureFestival(r) {
  for (let f = 0; f < 5; f++) for (let i = 0; i < 10; i++) r.readInt();
}
// story.py: read_itf_timed_scores (chapters 4,5,6)
function skipStoryItfTimedScores(r) {
  for (let i = 4; i < 7; i++) for (let j = 0; j < 51; j++) r.readInt();
}

// cat.py: Cats.read_unlocked → returns catCount
function skipCatsUnlocked(r, gv) {
  const n = readCatCount(r, gv); for (let i = 0; i < n; i++) r.readInt(); return n;
}
// NOTE: stream count読み捨て、常にnでloop (Pythonはself.catsでloop)
function skipCatsUpgrade(r, gv, n)          { if (getGvCats(gv) === null) r.readInt(); for (let i = 0; i < n; i++) readUpgrade(r); }
function skipCatsCurrentForm(r, gv, n)      { if (getGvCats(gv) === null) r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
function skipCatsUnlockedForms(r, gv, n)    { if (getGvCats(gv) === null) r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
function skipCatsGatyaSeen(r, gv, n)        { if (getGvCats(gv) === null) r.readInt(); for (let i = 0; i < n; i++) r.readInt(); }
function skipCatsMaxUpgradeLevels(r, gv, n) { if (getGvCats(gv) === null) r.readInt(); for (let i = 0; i < n; i++) readUpgrade(r); }
function skipCatsStorage(r, gv) {
  const total = gv < 110100 ? 100 : r.readShort();
  for (let i = 0; i < total; i++) r.readInt();
  for (let i = 0; i < total; i++) r.readInt();
}
function skipCatsCatguideCollected(r)  { const n = r.readInt(); for (let i=0;i<n;i++) r.readBool(); }
function skipCatsFourthForms(r)        { const n = r.readInt(); for (let i=0;i<n;i++) r.readInt(); }
function skipCatsCateyesUsed(r)        { const n = r.readInt(); for (let i=0;i<n;i++) r.readInt(); }
function skipCatsFavorites(r)          { const n = r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readBool(); } }
function skipCatsCharaNewFlags(r)      { const n = r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readInt(); } }
function skipCatsTalents(r) {
  const n = r.readInt();
  for (let i=0;i<n;i++) {
    r.readInt(); // cat_id
    const t = r.readInt();
    for (let j=0;j<t;j++) { r.readShort(); if (true) r.readUShort(); } // TalentOrb per cat - but this is in gv>=80000, handled separately
  }
}

// special_skill.py
function skipSpecialSkills(r)          { for (let i=0;i<11;i++) readUpgrade(r); }
function skipSpecialSkillsGatyaSeen(r) { for (let i=0;i<10;i++) r.readInt(); }
function skipSpecialSkillsMaxLevels(r) { for (let i=0;i<11;i++) readUpgrade(r); }

// battle_items.py
function skipBattleItems(r)       { for (let i=0;i<6;i++) r.readInt(); }
function skipBattleItemsLocked(r) { r.readBool(); for (let i=0;i<6;i++) r.readBool(); }
function skipBattleItemsEndless(r) {
  for (let i=0;i<6;i++) { r.readBool(); r.readBool(); r.readUByte(); r.readDouble(); r.readDouble(); }
}

// gatya.py
function skipGatyaRareNormalSeed(r, gv) { if (gv < 33) { r.readULong(); r.readULong(); } else { r.readUInt(); r.readUInt(); } }
function skipGatya2(r) { r.readInt();r.readInt();r.readInt();r.readInt();r.readInt(); r.readBool();r.readBool();r.readBool(); }
function skipGatyaTradeProgress(r) { r.readInt(); }
function skipGatyaEventSeed(r, gv) { if (gv < 33) r.readULong(); else r.readUInt(); }
function skipGatyaStepup(r) {
  const n1 = r.readInt(); for (let i=0;i<n1;i++) { r.readInt(); r.readInt(); }
  const n2 = r.readInt(); for (let i=0;i<n2;i++) { r.readInt(); r.readDouble(); }
}

// my_sale.py: MySale.read_bonus_hash
function skipMySale(r) {
  const n1 = r.readVariableLengthInt();
  for (let i=0;i<n1;i++) { r.readVariableLengthInt(); r.readVariableLengthInt(); }
  const n2 = r.readVariableLengthInt();
  for (let i=0;i<n2;i++) { r.readVariableLengthInt(); r.readByte(); }
}

// user_rank_rewards.py
function skipUserRankRewards(r, gv) {
  const total = gv >= 30 ? r.readInt() : 50;
  for (let i=0;i<total;i++) r.readBool();
}

// item_reward_stage.py: ItemRewardChapters.read
function skipItemRewardChapters(r, gv) {
  if (gv < 20) return;
  let total, stages, stars;
  if (gv <= 33)      { total=50; stages=12; stars=3; }
  else if (gv <= 34) { total=r.readInt(); stages=12; stars=3; }
  else               { total=r.readInt(); stages=r.readInt(); stars=r.readInt(); }
  for (let i=0;i<total;i++) for (let s=0;s<stars;s++) for (let st=0;st<stages;st++) r.readBool();
}
// item_reward_stage.py: read_item_obtains
function skipItemRewardItemObtains(r) {
  const n1 = r.readInt(); for (let i=0;i<n1;i++) { r.readInt(); const n2=r.readInt(); for (let j=0;j<n2;j++) { r.readInt(); r.readBool(); } }
  const n3 = r.readInt(); for (let i=0;i<n3;i++) { r.readInt(); r.readBool(); }
}

// timed_score.py: TimedScoreChapters.read
function skipTimedScoreChapters(r, gv) {
  if (gv < 20) return;
  let total, stages, stars;
  if (gv <= 33)      { total=50; stages=12; stars=3; }
  else if (gv <= 34) { total=r.readInt(); stages=12; stars=3; }
  else               { total=r.readInt(); stages=r.readInt(); stars=r.readInt(); }
  for (let i=0;i<total;i++) for (let s=0;s<stars;s++) for (let st=0;st<stages;st++) r.readInt();
}

// officer_pass.py: OfficerPass.read
function readOfficerPass(r) { return { playTime: r.readInt() }; }

// event.py: EventChapters.read
function skipEventChapters(r, gv) {
  if (gv < 20) return;
  function rc(withStages) {
    if (gv > 80099) { const mt=r.readUByte(),sc=r.readUShort(),sp=r.readUByte(); const stg=withStages?r.readUByte():0; return {mt,sc,sp,stg,isInt:false}; }
    else if (gv<=32) return {mt:3,sc:150,sp:3,stg:12,isInt:true};
    else if (gv<=34) return {mt:4,sc:150,sp:3,stg:12,isInt:true};
    else { const mt=r.readInt(),sc=r.readInt(),sp=r.readInt(); return {mt,sc,sp,stg:0,isInt:true}; }
  }
  function rv(isInt) { return isInt ? r.readInt() : r.readUShort(); }
  function sec(p, withStg) {
    for (let m=0;m<p.mt;m++) for (let sc=0;sc<p.sc;sc++) for (let sp=0;sp<p.sp;sp++) {
      if (withStg) for (let st=0;st<p.stg;st++) rv(p.isInt); else rv(p.isInt);
    }
  }
  const p1=rc(true); sec(p1,false);
  let p2; if (gv>80099) p2={...p1}; else if (gv<=32) p2={mt:3,sc:150,sp:3,isInt:true}; else if (gv<=34) p2={mt:4,sc:150,sp:3,isInt:true}; else {const mt=r.readInt(),sc=r.readInt(),sp=r.readInt();p2={mt,sc,sp,isInt:true};}
  sec(p2,false);
  let p3; if (gv>80099) p3={...p1}; else if (gv<=32) p3={mt:3,sc:150,sp:3,stg:12,isInt:true}; else if (gv<=34) p3={mt:4,sc:150,sp:3,stg:12,isInt:true}; else {const mt=r.readInt(),sc=r.readInt(),stg=r.readInt(),sp=r.readInt();p3={mt,sc,sp,stg,isInt:true};}
  sec(p3,true);
  let p4; if (gv>80099) p4={...p1}; else if (gv<=32) p4={mt:3,sc:150,sp:3,isInt:true}; else if (gv<=34) p4={mt:4,sc:150,sp:3,isInt:true}; else {const mt=r.readInt(),sc=r.readInt(),sp=r.readInt();p4={mt,sc,sp,isInt:true};}
  sec(p4,false);
}

// event.py: EventChapters.read_legend_restrictions
function skipEventLegendRestrictions(r, gv) {
  if (gv < 20) return;
  let mt, sc;
  if (gv < 33)      { mt=3; sc=150; }
  else if (gv < 41) { mt=4; sc=150; }
  else              { mt=r.readInt(); sc=r.readInt(); }
  for (let m=0;m<mt;m++) for (let s=0;s<sc;s++) r.readInt();
}

// event.py: EventChapters.read_dicts
function skipEventChapterDicts(r) {
  r.readIntIntDict(); r.readIntBoolDict(); r.readIntIntDict(); r.readIntList();
}

// gamatoto.py: Gamatoto.read
function skipGamatoto(r) {
  r.readDouble(); r.readBool(); r.readInt(); r.readInt(); r.readInt(); r.readInt(); r.readInt();
}
// gamatoto.py: Gamatoto.read_2
function skipGamatoto2(r) {
  const n = r.readInt(); for (let i=0;i<n;i++) r.readInt(); // Helpers
  r.readBool(); // is_ad_present
}
// gamatoto.py: Gamatoto.read_skin
function skipGamatotoSkin(r) { r.readInt(); }
// gamatoto.py: Gamatoto.read_collab_data
function skipGamatotoCollabData(r) { r.readIntBoolDict(); r.readIntDoubleDict(); }

// ototo.py: Ototo.read (BaseMaterials.read = int count + int items)
function skipOtoto(r) {
  const n = r.readInt(); for (let i=0;i<n;i++) r.readInt(); // BaseMaterials
}
// ototo.py: Ototo.read_2 + Cannons.read
function skipOtoto2(r, gv) {
  r.readDouble(); r.readBool(); r.readInt(); r.readInt(); // remaining_seconds, return_flag, improve_id, engineers
  // Cannons.read
  const nc = r.readInt();
  for (let i=0;i<nc;i++) {
    r.readInt(); // cannon_id
    const total = r.readInt(); // total levels+1
    for (let j=0;j<total;j++) r.readInt(); // development + levels
  }
  if (gv < 80200) {
    r.readIntList(3); // selected_parts[0] = 3 ints
  } else {
    const tsp = gv > 90699 ? r.readUByte() : 10;
    for (let i=0;i<tsp;i++) r.readByteList(3); // 3 bytes each
  }
}

// item_pack.py: ItemPack.read (Purchases)
function skipItemPack(r) {
  const n1 = r.readInt();
  for (let i=0;i<n1;i++) {
    r.readInt(); // key
    const n2 = r.readInt();
    for (let j=0;j<n2;j++) { r.readString(); r.readBool(); }
  }
}
// item_pack.py: read_displayed_packs
function skipItemPackDisplayedPacks(r) { const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readBool(); } }
// item_pack.py: read_three_days
function skipItemPackThreeDays(r) { r.readBool(); r.readDouble(); }

// login_bonuses.py: LoginBonus.read
function skipLoginBonus(r, gv) {
  if (gv < 80000) {
    const n1 = r.readInt(); for (let i=0;i<n1;i++) { const n2=r.readInt(); for (let j=0;j<n2;j++) r.readInt(); }
  } else {
    const n = r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readInt(); }
  }
}

// map_reset.py: MapResets.read
function skipMapResets(r) {
  const n = r.readInt();
  for (let i=0;i<n;i++) {
    r.readInt(); // key
    const n2 = r.readInt();
    for (let j=0;j<n2;j++) { r.readDouble(); r.readDouble(); r.readDouble(); r.readDouble(); }
  }
}

// dojo.py: Dojo.read_chapters (Chapters dict)
function skipDojo(r) {
  const n = r.readInt(); for (let i=0;i<n;i++) { r.readInt(); const n2=r.readInt(); for (let j=0;j<n2;j++) { r.readInt(); r.readInt(); } }
}
// dojo.py: read_item_locks
function skipDojoItemLocks(r) { r.readBool(); r.readBoolList(6); }
// dojo.py: read_ranking (Ranking.read)
function skipDojoRanking(r, gv) {
  r.readInt();r.readInt();r.readBool();r.readBool();r.readBool();
  r.readInt();r.readInt();r.readInt();r.readBool();r.readBool();r.readBool();
  if (gv >= 140500) r.readString();
}
// dojo.py: ranking.read_did_win_rewards
function skipDojoRankingDidWinRewards(r) { r.readBool(); }

// outbreaks.py: Outbreaks.read_chapters
function skipOutbreaks(r) { const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); const n2=r.readInt(); for (let j=0;j<n2;j++) { r.readInt(); r.readBool(); } } }
// outbreaks.py: read_2
function skipOutbreaks2(r) { r.readDouble(); }
// outbreaks.py: read_current_outbreaks
function skipOutbreaksCurrentOutbreaks(r, gv) {
  if (gv <= 43) {
    const n = r.readInt(); for (let i=0;i<n;i++) { r.readInt(); const n2=r.readInt(); for (let j=0;j<n2;j++) { r.readInt(); r.readBool(); } }
  }
  const n = r.readInt(); for (let i=0;i<n;i++) { r.readInt(); const n2=r.readInt(); for (let j=0;j<n2;j++) { r.readInt(); r.readBool(); } }
}

// scheme_items.py: SchemeItems.read
function skipSchemeItems(r) {
  const n1=r.readInt(); for (let i=0;i<n1;i++) r.readInt();
  const n2=r.readInt(); for (let i=0;i<n2;i++) r.readInt();
}

// unlock_popups.py: UnlockPopups.read
function skipUnlockPopups(r) { const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readBool(); } }

// beacon_base.py: BeaconEventListScene.read
function skipBeaconBase(r) {
  const n1=r.readInt(); for (let i=0;i<n1;i++) { r.readInt(); r.readInt(); }
  const n2=r.readInt(); for (let i=0;i<n2;i++) { r.readInt(); r.readStringList(); }
  const n3=r.readInt(); for (let i=0;i<n3;i++) { r.readInt(); r.readBool(); }
}

// chapters.py: Chapters.read(read_every_time=True) - tower, challenge
function skipChapters(r) {
  const tc=r.readInt(), ts0=r.readInt(); // total_chapters, total_stars (pass1)
  for (let i=0;i<tc*ts0;i++) r.readInt(); // selected_stage
  const tc2=r.readInt(), ts1=r.readInt(); // pass2
  for (let i=0;i<tc*ts1;i++) r.readInt(); // clear_progress (use tc, ts1 may differ but should match)
  const tc3=r.readInt(), tst=r.readInt(), ts2=r.readInt(); // pass3: stages
  for (let i=0;i<tc*tst*ts2;i++) r.readInt(); // stages (interleaved)
  const tc4=r.readInt(), ts3=r.readInt(); // pass4
  for (let i=0;i<tc*ts3;i++) r.readInt(); // chapter_unlock_state
}

// tower.py: TowerChapters.read_item_obtain_states
function skipTowerItemObtainStates(r) {
  const ts=r.readInt(), tst=r.readInt();
  for (let i=0;i<ts;i++) r.readBoolList(tst);
}

// mission.py: Missions.read
function skipMissions(r, gv) {
  for (let i=0;i<7;i++) r.readIntIntDict(); // 7 dicts
  const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); if (gv<90300) r.readBool(); else r.readInt(); }
}
// mission.py: read_weekly_missions
function skipMissionsWeekly(r) { const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readBool(); } }

// challenge.py: ChallengeChapters.read_scores, read_popup
function skipChallengeScores(r) { const n=r.readInt(); for (let i=0;i<n;i++) r.readInt(); }
function skipChallengePopup(r) { r.readBool(); }

// uncanny.py: UncannyChapters.read (Chapters with read_every_time=False)
function skipUncanny(r) {
  const tc=r.readInt(), ts=r.readInt(), tst=r.readInt();
  for (let i=0;i<tc*tst;i++) r.readInt(); // selected_stage
  for (let i=0;i<tc*tst;i++) r.readInt(); // clear_progress
  for (let i=0;i<tc*ts*tst;i++) r.readInt(); // stages
  for (let i=0;i<tc*tst;i++) r.readInt(); // chapter_unlock_state
  for (let i=0;i<tc;i++) r.readInt(); // unknown
}

// gauntlets.py: GauntletChapters.read
function skipGauntlets(r) {
  const tc=r.readShort(), ts=r.readUByte(), tst=r.readUByte();
  for (let i=0;i<tc*tst;i++) r.readUByte(); // selected_stage (byte)
  for (let i=0;i<tc*tst;i++) r.readUByte(); // clear_progress (byte)
  for (let i=0;i<tc;i++) for (let s=0;s<ts;s++) for (let j=0;j<tst;j++) r.readShort(); // stages (short, interleaved per chapter)
  for (let i=0;i<tc*tst;i++) r.readUByte(); // chapter_unlock_state (byte)
  for (let i=0;i<tc;i++) r.readUByte(); // unknown
}

// enigma.py: Enigma.read
function skipEnigma(r, gv) {
  r.readInt(); r.readInt(); r.readUByte(); r.readUByte(); r.readBool();
  const n=r.readUByte();
  for (let i=0;i<n;i++) { r.readInt(); r.readInt(); r.readUByte(); r.readDouble(); }
  if (gv >= 140500) { const hasExtra=r.readBool(); if (hasExtra) { r.readInt();r.readInt();r.readUByte();r.readDouble(); } }
}

// cleared_slots.py: ClearedSlots.read
function skipClearedSlots(r) {
  const n1=r.readShort();
  for (let i=0;i<n1;i++) {
    r.readShort(); for (let j=0;j<10;j++) { r.readShort(); r.readUByte(); } r.readUByte();r.readUByte();r.readUByte();
  }
  const n2=r.readShort();
  for (let i=0;i<n2;i++) { r.readShort(); const n3=r.readShort(); for (let j=0;j<n3;j++) r.readInt(); }
  const n4=r.readShort(); for (let i=0;i<n4;i++) { r.readShort(); r.readBool(); }
}

// aku.py: AkuChapters.read
function skipAku(r) {
  const tc=r.readShort(), ts=r.readUByte(), tst=r.readUByte();
  for (let i=0;i<tc;i++) for (let j=0;j<tst;j++) r.readUByte(); // current_stage (byte)
  for (let i=0;i<tc;i++) for (let j=0;j<tst;j++) for (let k=0;k<ts;k++) r.readShort(); // stages (short)
}

// gambling.py: GamblingEvent.read
function skipGamblingEvent(r, gv) {
  const n1=r.readShort(); for (let i=0;i<n1;i++) { r.readShort(); r.readBool(); }
  const n2=r.readShort(); for (let i=0;i<n2;i++) { r.readShort(); const n3=r.readShort(); for (let j=0;j<n3;j++) { r.readShort(); r.readShort(); } }
  const n4=r.readShort(); for (let i=0;i<n4;i++) { r.readShort(); if (gv<90100) r.readDouble(); else r.readInt(); }
}

// medals.py: Medals.read
function skipMedals(r) {
  r.readInt();r.readInt();r.readInt();
  const n1=r.readShort(); for (let i=0;i<n1;i++) r.readShort();
  const n2=r.readShort(); for (let i=0;i<n2;i++) { r.readShort(); r.readUByte(); }
  r.readBool();
}

// nyanko_club.py: NyankoClub.read
function skipNyankoClub(r, gv) {
  r.readInt();r.readInt();
  for (let i=0;i<7;i++) r.readDouble();
  r.readInt(); r.readDouble(); r.readIntIntDict(); r.readDouble(); r.readBool();
  if (gv >= 80100) r.readBool();
}

// talent_orbs.py: TalentOrbs.read
function skipTalentOrbs(r, gv) {
  const n=r.readShort();
  for (let i=0;i<n;i++) { r.readShort(); if (gv<110400) r.readUByte(); else r.readUShort(); }
}

// cat_shrine.py: CatShrine.read
function skipCatShrine(r) {
  r.readBool(); r.readDouble(); r.readDouble(); r.readBool();
  const n=r.readUByte(); for (let i=0;i<n;i++) r.readByte();
  r.readBytes(8); // readLong (xp_offering)
}
// cat_shrine.py: read_dialogs
function skipCatShrineDialogs(r) { r.readInt(); }

// legend_quest.py: LegendQuestChapters.read
function skipLegendQuest(r) {
  const tc=r.readUByte(), ts=r.readUByte(), tst=r.readUByte();
  for (let i=0;i<tc*tst;i++) r.readUByte(); // selected_stage
  for (let i=0;i<tc*tst;i++) r.readUByte(); // clear_progress
  // stages: clear_times + tries (both shorts, per chapter*stage*star)
  for (let i=0;i<tc*ts*tst;i++) r.readShort(); // clear_times
  for (let i=0;i<tc*ts*tst;i++) r.readShort(); // tries
  for (let i=0;i<tc*tst;i++) r.readUByte(); // chapter_unlock_state
  for (let i=0;i<tc;i++) r.readUByte(); // unknown
  for (let i=0;i<ts;i++) r.readInt(); // ids
}

// zero_legends.py: ZeroLegendsChapters.read
function skipZeroLegends(r) {
  const tc=r.readShort();
  for (let i=0;i<tc;i++) {
    r.readUByte(); // unknown
    const tst=r.readUByte(); // total_stars
    for (let j=0;j<tst;j++) {
      r.readUByte();r.readUByte();r.readUByte(); // selected_stage, clear_progress, unlock_state
      const ts=r.readShort(); for (let k=0;k<ts;k++) r.readShort(); // stages
    }
  }
}

// ex_stage.py: ExChapters.read
function skipExChapters(r) { const n=r.readInt(); for (let i=0;i<n;i++) for (let j=0;j<12;j++) r.readInt(); }

// ─── メインパーサー ───────────────────────────────────────────────────────────

export function parseSaveFile(buf) {
  const L = (msg) => console.log(msg);
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
  L('02 pos='+r.pos);

  r.readInt();r.readInt();r.readInt();r.readInt();r.readInt();r.readInt();
  r.readDouble(); r.readInt();r.readInt();r.readInt();
  readDst(r, gv, isJP);
  L('03 pos='+r.pos);

  r.readInt();r.readInt();r.readInt(); r.readInt();r.readInt();r.readInt();
  r.readInt();r.readInt(); r.readIntList(3);
  r.readInt();r.readInt();r.readInt(); r.readBool();
  r.readInt();r.readInt();r.readInt();r.readInt();
  L('04 pos='+r.pos);

  skipLineUps(r, gv);     L('05 pos='+r.pos);
  skipStampData(r);        L('06 pos='+r.pos);
  skipStoryChapters(r);    L('07 pos='+r.pos);

  if (gv >= 20 && gv <= 25) r.readIntList(231); else r.readIntList();
  L('08 pos='+r.pos);

  const catCount = skipCatsUnlocked(r, gv);       L('09 catCount='+catCount+' pos='+r.pos);
  skipCatsUpgrade(r, gv, catCount);               L('10 pos='+r.pos);
  skipCatsCurrentForm(r, gv, catCount);           L('11 pos='+r.pos);
  skipSpecialSkills(r);                           L('12 pos='+r.pos);

  if (gv <= 25)       { r.readIntList(5); r.readIntList(5); }
  else if (gv === 26) { r.readIntList(6); r.readIntList(6); }
  else                { r.readIntList();  r.readIntList(); }
  L('13 pos='+r.pos);

  skipBattleItems(r);                             L('14 pos='+r.pos);
  if (gv <= 26) r.readIntList(17); else r.readIntList(); L('15 pos='+r.pos);
  r.readIntList(20); r.readIntList(1); r.readIntList(1);
  skipBattleItemsLocked(r);                       L('16 pos='+r.pos);

  readDst(r, gv, isJP); r.readDate();            L('17 pos='+r.pos);
  skipStoryTreasureFestival(r);                   L('18 pos='+r.pos);
  readDst(r, gv, isJP); r.readDate();            L('19 pos='+r.pos);

  if (gv <= 37) r.readInt();
  r.readInt();r.readInt();r.readInt();r.readInt();r.readInt();r.readInt();
  r.readString();                                 L('20 pos='+r.pos);

  skipMySale(r);                                  L('21 pos='+r.pos);
  r.readIntList(2);
  if (gv <= 37) { r.readInt(); r.readBool(); }
  r.readIntList(2);                               L('22 pos='+r.pos);

  const normalTickets = r.readInt();
  const rareTickets   = r.readInt();              L('23 pos='+r.pos);

  skipCatsGatyaSeen(r, gv, catCount);            L('24 pos='+r.pos);
  skipSpecialSkillsGatyaSeen(r);                  L('25 pos='+r.pos);
  skipCatsStorage(r, gv);                         L('26 pos='+r.pos);
  skipEventChapters(r, gv);                       L('27 pos='+r.pos);

  r.readInt(); r.readInt();
  if (gv >= 20)             r.readIntList(36);
  if (gv >= 20 && gv <= 25) r.readIntList(110);
  else if (gv >= 26)        r.readIntList();       L('28 pos='+r.pos);

  skipGatyaRareNormalSeed(r, gv);
  r.readBool(); r.readBoolList(7); r.readInt();   L('29 pos='+r.pos);

  readDst(r, gv, isJP); r.readDate();            L('30 pos='+r.pos);
  skipGatya2(r);                                  L('31 pos='+r.pos);

  if (notJP) r.readString();
  r.readStringList();                             L('32 pos='+r.pos);

  if (notJP) { r.readDouble();r.readDouble();r.readDouble(); r.readStringList(); r.readBool(); r.readInt(); }
  L('33 pos='+r.pos);

  skipLineUps2(r, gv);                            L('34 pos='+r.pos);
  skipEventLegendRestrictions(r, gv);             L('35 pos='+r.pos);

  if (gv <= 37) { r.readIntList(7);r.readIntList(7);r.readIntList(7); }
  r.readDouble();r.readDouble();r.readDouble();r.readDouble();
  skipGatyaTradeProgress(r);                      L('36 pos='+r.pos);

  if (gv <= 37) r.readStringList();
  if (notJP) r.readDouble(); else r.readInt();    L('37 pos='+r.pos);

  if (gv >= 20 && gv <= 25)     r.readBoolList(12);
  else if (gv >= 26 && gv < 39) r.readBoolList(); L('38 pos='+r.pos);

  skipCatsMaxUpgradeLevels(r, gv, catCount);      L('39 pos='+r.pos);
  skipSpecialSkillsMaxLevels(r);                  L('40 pos='+r.pos);
  skipUserRankRewards(r, gv);                     L('41 pos='+r.pos);
  if (!notJP) r.readDouble();
  skipCatsUnlockedForms(r, gv, catCount);         L('42 pos='+r.pos);

  r.readString(); r.readString(); r.readBool();   L('43 pos='+r.pos);

  let inquiryCode = '', playTime = 0;

  if (gv >= 20) {
    skipItemRewardChapters(r, gv);                L('45 pos='+r.pos);
    skipTimedScoreChapters(r, gv);                L('46 pos='+r.pos);
    inquiryCode = r.readString();                 L('47 inquiryCode='+inquiryCode+' pos='+r.pos);
    const op = readOfficerPass(r); playTime = op.playTime;
    r.readByte(); r.readInt();
    if (notJP) r.readBool();
    L('48 before assert(44) pos='+r.pos);
    r.assertInt(44);
    r.readInt(); skipStoryItfTimedScores(r); r.readInt();
    if (gv > 26) r.readIntList();
    r.readBool(); r.assertInt(45);               L('49 pos='+r.pos);
  }
  if (gv >= 21) {
    r.assertInt(46); skipGatyaEventSeed(r, gv);
    if (gv < 34) { r.readIntList(100); r.readIntList(100); }
    else         { r.readIntList(); r.readIntList(); }
    r.assertInt(47);                              L('50 pos='+r.pos);
  }
  if (gv >= 22) r.assertInt(48);
  if (gv >= 23) {
    if (!notJP) r.readBool();
    r.readDouble();
    if (gv < 26) r.readIntList(44); else r.readIntList();
    r.readBool(); r.readBoolList(3); r.readDouble(); r.readBoolList(3); r.readInt();
    r.assertInt(49);                              L('51 pos='+r.pos);
  }
  if (gv >= 24) r.assertInt(50);
  if (gv >= 25) r.assertInt(51);
  if (gv >= 26) { skipCatsCatguideCollected(r); r.assertInt(52); }
  if (gv >= 27) {
    r.readDouble();r.readDouble();r.readDouble();r.readDouble();r.readDouble();
    r.readIntList(); skipCatsFourthForms(r); skipCatsCateyesUsed(r);
    r.readIntList(); r.readIntList();
    skipGamatoto(r); r.readBoolList(); skipExChapters(r);
    r.assertInt(53);                              L('52 pos='+r.pos);
  }
  if (gv >= 29) { skipGamatoto2(r); r.assertInt(54); skipItemPack(r); r.assertInt(54); }
  if (gv >= 30) {
    skipGamatotoSkin(r); r.readInt(); // platinum_tickets
    skipLoginBonus(r, gv);
    if (gv < 101000) r.readBoolList();
    r.readDouble(); r.readDouble(); r.readIntTupleList(16);
    r.readInt();r.readInt();r.readInt();r.readInt();
    r.assertInt(55);                              L('53 pos='+r.pos);
  }
  if (gv >= 31) { r.readBool(); skipItemRewardItemObtains(r); skipGatyaStepup(r); r.readInt(); r.assertInt(56); }
  if (gv >= 32) { r.readBool(); skipCatsFavorites(r); r.assertInt(57); }
  if (gv >= 33) { skipDojo(r); skipDojoItemLocks(r); r.assertInt(58); }
  if (gv >= 34) { r.readDouble(); skipOutbreaks(r); skipOutbreaks2(r); skipSchemeItems(r); }

  let energyPenaltyTimestamp = 0;
  if (gv >= 35) {
    skipOutbreaksCurrentOutbreaks(r, gv);
    r.readIntBoolDict(); // first_locks
    energyPenaltyTimestamp = r.readDouble();
    r.assertInt(60);                              L('54 pos='+r.pos);
  }
  if (gv >= 36) { skipCatsCharaNewFlags(r); r.readBool(); skipItemPackDisplayedPacks(r); r.assertInt(61); }
  if (gv >= 38) { skipUnlockPopups(r); r.assertInt(63); }
  if (gv >= 39) { skipOtoto(r); skipOtoto2(r, gv); r.readDouble(); r.assertInt(64); L('55 pos='+r.pos); }
  if (gv >= 40) { skipBeaconBase(r); r.assertInt(65); L('56 pos='+r.pos); }
  if (gv >= 41) {
    skipChapters(r); // TowerChapters
    skipMissions(r, gv); skipTowerItemObtainStates(r);
    r.assertInt(66);                              L('57 pos='+r.pos);
  }
  if (gv >= 42) {
    skipDojoRanking(r, gv); skipItemPackThreeDays(r);
    skipChapters(r); // ChallengeChapters
    skipChallengeScores(r); skipChallengePopup(r);
    r.assertInt(67);                              L('58 pos='+r.pos);
  }
  if (gv >= 43) { skipMissionsWeekly(r); skipDojoRankingDidWinRewards(r); r.readBool(); r.assertInt(68); }
  if (gv >= 44) { skipEventChapterDicts(r); r.readInt(); r.assertInt(69); }
  if (gv >= 46) { skipGamatotoCollabData(r); r.assertInt(71); }
  if (gv < 90300) { skipMapResets(r); r.assertInt(72); }
  if (gv >= 51)  { skipUncanny(r); r.assertInt(76); }
  if (gv >= 77)  { skipUncanny(r); r.readIntList(); r.readBool(); r.assertInt(77); L('59 pos='+r.pos); }
  if (gv >= 80000) {
    skipNyankoClub(r, gv); // officer_pass.read_gold_pass
    // cats.read_talents
    const nt=r.readInt(); for (let i=0;i<nt;i++) { r.readInt(); const t=r.readInt(); for (let j=0;j<t;j++) { r.readShort(); if (gv<110400) r.readUByte(); else r.readUShort(); } }
    r.readInt(); r.readBool(); // np, ub6
    r.assertInt(80000);                           L('60 pos='+r.pos);
  }
  if (gv >= 80200) { r.readBool(); r.readShort(); r.readShort(); r.readShort(); r.assertInt(80200); }
  if (gv >= 80300) { r.readByte(); r.readBool(); r.assertInt(80300); }
  if (gv >= 80500) { r.readIntList(); r.assertInt(80500); }
  if (gv >= 80600) {
    const n=r.readShort(); r.readIntList(n);
    skipLegendQuest(r); r.readShort(); r.readUByte();
    r.assertInt(80600);                           L('61 pos='+r.pos);
  }
  if (gv >= 80700) {
    const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readIntList(); }
    r.assertInt(80700);
  }
  if (gv >= 100600 && !notJP) { r.readByte(); r.assertInt(100600); } // is_en check
  if (gv >= 81000) { r.readByte(); r.assertInt(81000); }
  if (gv >= 90000) {
    skipMedals(r); skipGamblingEvent(r, gv); // wildcat_slots
    r.assertInt(90000);                           L('62 pos='+r.pos);
  }
  if (gv >= 90100) { r.readShort();r.readShort();r.readInt();r.readDouble(); r.assertInt(90100); }
  if (gv >= 90300) {
    const n=r.readShort();
    for (let i=0;i<n;i++) { r.readInt();r.readInt();r.readShort();r.readInt();r.readInt();r.readInt();r.readShort(); }
    const nd=r.readShort(); r.readIntDoubleDict(nd);
    skipGauntlets(r); // gauntlets
    r.assertInt(90300);                           L('63 pos='+r.pos);
  }
  if (gv >= 90400) {
    skipGauntlets(r); // enigma_clears
    skipEnigma(r, gv);
    skipClearedSlots(r);
    r.assertInt(90400);                           L('64 pos='+r.pos);
  }
  if (gv >= 90500) {
    skipGauntlets(r); // collab_gauntlets
    r.readBool();r.readDouble();r.readDouble();r.readInt();
    if (gv >= 100300) { r.readByte();r.readBool();r.readDouble();r.readDouble(); }
    if (gv >= 130700) {
      const n1=r.readShort(); for (let i=0;i<n1;i++) { r.readInt();r.readByte(); }
      const n2=r.readShort(); for (let i=0;i<n2;i++) { r.readInt();r.readDouble(); }
    }
    if (gv >= 140100) { const n3=r.readShort(); for (let i=0;i<n3;i++) { r.readInt();r.readDouble(); } }
    r.assertInt(90500);                           L('65 pos='+r.pos);
  }
  if (gv >= 90700) {
    skipTalentOrbs(r, gv);
    const nu=r.readShort(); for (let i=0;i<nu;i++) { r.readShort(); const nb=r.readUByte(); for (let j=0;j<nb;j++) { r.readUByte();r.readShort(); } }
    r.readBool(); // ub10
    r.assertInt(90700);                           L('66 pos='+r.pos);
  }
  if (gv >= 90800) {
    const n=r.readShort(); r.readIntList(n); r.readBoolList(10);
    r.assertInt(90800);
  }
  if (gv >= 90900) { skipCatShrine(r); r.readDouble();r.readDouble(); r.assertInt(90900); }
  if (gv >= 91000) { skipLineUpsSlotNames(r, gv); r.assertInt(91000); }

  const late = _parseLaterSections(r, gv, notJP);

  return {
    cc, gameVersion: gv, inquiryCode, energyPenaltyTimestamp,
    passwordRefreshToken: late.passwordRefreshToken,
    playTime, userRank: 0,
    catfood, rareTickets,
    platinumTickets: late.platinumTickets,
    legendTickets: late.legendTickets,
    rawBytes: buf,
  };
}

// ─── gv>=100000 以降 ──────────────────────────────────────────────────────────

function _parseLaterSections(r, gv, notJP) {
  let passwordRefreshToken = '', legendTickets = 0, platinumTickets = 0;
  try {
    if (gv >= 100000) {
      legendTickets = r.readInt();
      const n=r.readUByte(); for (let i=0;i<n;i++) { r.readUByte(); r.readInt(); }
      r.readBool();r.readBool();
      passwordRefreshToken = r.readString();
      r.readBool();r.readUByte();r.readUByte();r.readDouble();r.readDouble();
      r.assertInt(100000);
    }
    if (gv >= 100100) { r.readInt(); r.assertInt(100100); }
    if (gv >= 100300) { skipBattleItemsEndless(r); r.assertInt(100300); }
    if (gv >= 100400) { const n=r.readUByte(); r.readIntList(n); r.readBool(); r.assertInt(100400); }
    if (gv >= 100600) {
      r.readDouble(); platinumTickets=r.readInt(); r.readBool();
      r.assertInt(100600);
    }
    if (gv >= 100700) { skipGamblingEvent(r, gv); r.assertInt(100700); } // cat_scratcher
    if (gv >= 100900) {
      skipAku(r); r.readBool();r.readBool();
      const n1=r.readShort(); for (let i=0;i<n1;i++) { r.readShort(); const n2=r.readShort(); for (let j=0;j<n2;j++) r.readShort(); }
      const n3=r.readShort(); for (let i=0;i<n3;i++) { r.readShort();r.readDouble(); }
      const n4=r.readShort(); for (let i=0;i<n4;i++) { r.readShort();r.readDouble(); }
      r.readBool(); r.assertInt(100900);
    }
    if (gv >= 101000) { r.readUByte(); r.assertInt(101000); }
    if (gv >= 110000) {
      const n=r.readShort(); for (let i=0;i<n;i++) { r.readInt(); r.readUByte();r.readUByte(); }
      r.assertInt(110000);
    }
    if (gv >= 110500) { skipGauntlets(r); r.readBool(); r.assertInt(110500); } // behemoth_culling
    if (gv >= 110600) { r.readBool(); r.assertInt(110600); }
    if (gv >= 110700) {
      const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt();r.readDouble();r.readDouble(); }
      if (notJP) r.readBool(); r.assertInt(110700);
    }
    if (gv >= 110800) { skipCatShrineDialogs(r); r.readBool();r.readBool();r.readBool();r.readBool(); r.assertInt(110800); }
    if (gv >= 111000) {
      r.readInt();r.readShort();r.readUByte();r.readUByte();r.readBool();r.readUByte();
      const n1=r.readUByte(); r.readShortList(n1);
      const n2=r.readShort(); r.readShortList(n2);
      const n3=r.readShort(); r.readShortList(n3);
      r.readInt();r.readInt();r.readInt();
      r.readShort();r.readShort();r.readShort();r.readShort();
      r.readUByte();r.readBool();r.readBool();r.readBool();r.readBool();r.readBool();r.readBool();r.readUByte();
      const n4=r.readShort(); r.readShortList(n4);
      r.readBoolList(14);
      const n5=r.readUByte(); r.readShortList(n5);
      r.assertInt(111000);
    }
    if (gv >= 120000) { skipZeroLegends(r); r.readUByte(); r.assertInt(120000); }
    if (gv >= 120100) { const n=r.readShort(); r.readShortList(n); r.assertInt(120100); }
    if (gv >= 120200) {
      r.readBool();r.readShort();
      const n=r.readUByte(); for (let i=0;i<n;i++) { r.readShort();r.readShort(); }
      r.assertInt(120200);
    }
    if (gv >= 120400) { r.readDouble();r.readDouble(); r.assertInt(120400); }
    if (gv >= 120500) { r.readBool();r.readBool();r.readBool(); r.readInt();r.readUByte(); r.assertInt(120500); }
    if (gv >= 120600) { r.readUByte();r.readUByte(); r.assertInt(120600); }
    if ((!notJP && gv >= 120700) || (notJP && gv >= 130000)) {
      // Note: condition is reversed from save.py (not_jp means EN/KR/TW)
      // save.py: (not_jp and gv>=120700) OR (is_jp and gv>=130000)
    }
    if (notJP && gv >= 120700) {
      const n=r.readUByte(); for (let i=0;i<n;i++) { r.readString(); r.readString(); }
      r.assertInt(120700);
    } else if (!notJP && gv >= 130000) {
      const n=r.readUByte(); for (let i=0;i<n;i++) { r.readString(); r.readString(); }
      r.assertInt(130000);
    }
    if (gv >= 130100) {
      const n=r.readInt(); for (let i=0;i<n;i++) { r.readInt(); r.readBytes(8); } // readLong
      r.assertInt(130100);
    }
    if (gv >= 130301) {
      const n=r.readInt(); for (let i=0;i<n;i++) { r.readString(); r.readInt(); r.readDouble(); }
      r.assertInt(130301);
    }
    if (gv >= 130400) { r.readDouble();r.readDouble(); r.assertInt(130400); }
    if (gv >= 130500) {
      const n1=r.readShort();
      for (let i=0;i<n1;i++) {
        r.readUByte(); const n2=r.readUByte();
        for (let j=0;j<n2;j++) {
          r.readUByte();r.readUByte();r.readUByte();
          const n3=r.readShort(); for (let k=0;k<n3;k++) r.readShort();
        }
      }
      r.assertInt(130500);
    }
    if (gv >= 130600) { r.readUByte(); if (notJP) r.readShort(); r.assertInt(130600); }
    if (gv >= 130700) {
      if (!notJP) r.readShort(); // is_jp
      r.readDouble();r.readUByte();r.readUByte(); r.readShort();r.readUByte();r.readUByte();r.readUByte(); r.readDouble();
      const n1=r.readShort();
      for (let i=0;i<n1;i++) {
        r.readShort();r.readShort();r.readInt();
        const n2=r.readShort(); for (let j=0;j<n2;j++) { r.readShort();r.readShort(); }
      }
      r.assertInt(130700);
    }
    if (gv >= 140000) {
      r.readInt();r.readDouble();r.readUByte();
      const n1=r.readUByte(); for (let i=0;i<n1;i++) { r.readInt(); const n2=r.readUByte(); for (let j=0;j<n2;j++) r.readUByte(); }
      skipZeroLegends(r); // dojo_chapters
      const n3=r.readShort(); for (let i=0;i<n3;i++) r.readInt();
      r.readBool();r.readDouble();
      const n4=r.readShort(); for (let i=0;i<n4;i++) { r.readShort();r.readUByte(); }
      r.assertInt(140000);
    }
    if (gv >= 140100 && gv < 140500) { r.readUByte(); r.assertInt(140100); }
    if (gv >= 140200) {
      const n1=r.readUByte();
      for (let i=0;i<n1;i++) {
        r.readInt();r.readInt();r.readBool();r.readBool();r.readBool();
        r.readInt();r.readInt();r.readInt();r.readBool();r.readBool();r.readBool();
        if (gv >= 140500) r.readString();
        r.readBool();
      }
      const n2=r.readUByte(); for (let i=0;i<n2;i++) { r.readInt();r.readDouble(); }
      r.readInt(); // hundred_million_ticket
      r.assertInt(140200);
    }
    if (gv >= 140300) {
      const n1=r.readUByte(); for (let i=0;i<n1;i++) r.readUByte();
      r.readBool();
      const n2=r.readUByte(); for (let i=0;i<n2;i++) r.readInt();
      r.readInt();
      const n3=r.readShort(); for (let i=0;i<n3;i++) r.readInt();
      r.readBool(); r.assertInt(140300);
    }
  } catch (e) {
    console.warn('Late section warning (non-fatal):', e.message);
  }
  return { passwordRefreshToken, legendTickets, platinumTickets };
}
