// 阿里山冒險 Part 2 — Scriptable 桌面／鎖定畫面小工具
// 支援：小、中、大尺寸，以及鎖定畫面「長方形」小工具。點小工具會打開行程 App。
// 資料：上網時自動更新並存到手機；山上沒訊號時用最後一次的資料。
const SITE = 'https://tardis7575.github.io/alishan-trip-2026/';
const DATA_URL = SITE + 'widget.json';
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'alishan-widget.json');

async function loadData() {
  try {
    const req = new Request(DATA_URL + '?ts=' + Date.now());
    req.timeoutInterval = 8;
    const txt = await req.loadString();
    const d = JSON.parse(txt);
    if (d && d.days) { fm.writeString(cachePath, txt); return d; }
  } catch (e) {}
  if (fm.fileExists(cachePath)) return JSON.parse(fm.readString(cachePath));
  return null;
}

// 以台北時間計算（手機在台灣時與本機時間相同）
function twParts(date) {
  const p = new Date(date.getTime() + 8 * 3600e3);
  const ymd = p.toISOString().slice(0, 10);
  return { ymd, mins: p.getUTCHours() * 60 + p.getUTCMinutes() };
}
function toDate(ymd, hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [Y, M, D] = ymd.split('-').map(Number), [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h - 8, m));
}
const ICON = { move: '🚌', walk: '🥾', food: '🍜', view: '🌄', must: '⭐' };

function computeState(data, now) {
  const { ymd } = twParts(now);
  const keys = Object.keys(data.days).sort();
  const st = { phase: 'during', ymd, day: data.days[ymd], cur: null, next: null, upcoming: [], sky: null };
  if (ymd < keys[0]) { st.phase = 'before'; st.ymd = keys[0]; st.day = data.days[keys[0]]; }
  else if (ymd > keys[keys.length - 1]) { st.phase = 'after'; return st; }
  // 今天 + 明天的項目，用來找「下一站」（晚上也能看到明早的祝山線）
  const list = [];
  for (const k of keys) {
    if (k < st.ymd) continue;
    for (const it of data.days[k].items) {
      const s = toDate(k, it.t); if (!s) continue;
      const e = toDate(k, it.e) || new Date(s.getTime() + 30 * 60e3);
      list.push({ ...it, s, eD: e, ymd: k });
    }
  }
  for (const it of list) {
    if (now >= it.s && now < it.eD) st.cur = it;
    if (it.s > now) st.upcoming.push(it);
  }
  st.next = st.upcoming[0] || null;
  // 下一個天象事件
  const ev = [];
  for (const k of keys) {
    if (k < st.ymd) continue;
    const a = data.days[k].astro;
    [['🔵 藍色時段', a.dawn], [k === '2026-10-30' ? '🌄 祝山日出' : '🌅 日出', k === '2026-10-30' && a.zs ? a.zs : a.sr],
     ['🌇 日落', a.ss], ['✨ 天全黑', a.dusk], ['🌙 月出', a.mr]].forEach(([n, t]) => {
      const d = toDate(k, t); if (d && d > now) ev.push({ n, t, d });
    });
  }
  ev.sort((x, y) => x.d - y.d);
  st.sky = ev[0] || null;
  return st;
}

function addCountdown(stack, date, size, color) {
  const d = stack.addDate(date);
  d.applyRelativeStyle(); // iOS 會自動即時更新「x 分後」
  d.font = Font.mediumSystemFont(size); d.textColor = color; d.lineLimit = 1;
  return d;
}

async function build() {
  const data = await loadData();
  const fam = config.widgetFamily || 'medium';
  const w = new ListWidget();
  w.url = SITE;
  const g = new LinearGradient();
  g.colors = [new Color('#1f3b2d'), new Color('#2e5a43')]; g.locations = [0, 1];
  w.backgroundGradient = g;
  const white = Color.white(), soft = new Color('#ffffff', 0.72), amber = new Color('#ffc27a');
  if (!data) { const t = w.addText('⛰️ 先連網打開一次'); t.textColor = white; return w; }
  const now = new Date();
  const st = computeState(data, now);

  if (fam === 'accessoryRectangular') {
    const nx = st.next;
    const a = w.addText(nx ? `${ICON[nx.k] || '•'} ${nx.t} ${nx.n}` : '⛰️ 阿里山'); a.font = Font.semiboldSystemFont(13); a.lineLimit = 2;
    if (nx) addCountdown(w, nx.s, 12, white);
    w.refreshAfterDate = nx ? nx.s : new Date(now.getTime() + 3600e3);
    return w;
  }

  w.setPadding(12, 14, 12, 14);
  const head = w.addStack(); head.centerAlignContent();
  const ht = head.addText(st.phase === 'after' ? '🏡 旅程結束' : `⛰️ ${(st.day && st.day.label.split('｜')[0]) || '阿里山'}`);
  ht.font = Font.boldSystemFont(fam === 'small' ? 13 : 15); ht.textColor = amber;
  if (fam !== 'small' && st.day) { head.addSpacer(); const wx = head.addText(st.day.wx); wx.font = Font.systemFont(11); wx.textColor = soft; }
  if (st.phase === 'after') return w;
  w.addSpacer(6);

  if (st.cur && fam !== 'small') {
    const c = w.addText(`現在：${ICON[st.cur.k] || ''} ${st.cur.n}`); c.font = Font.semiboldSystemFont(13); c.textColor = white; c.lineLimit = 1;
    w.addSpacer(4);
  }
  if (st.next) {
    const lab = w.addText(`下一站 ${st.next.t}${st.next.ymd !== twParts(now).ymd ? '（明天）' : ''}`); lab.font = Font.systemFont(11); lab.textColor = soft;
    const n = w.addText(`${ICON[st.next.k] || ''} ${st.next.n}`); n.font = Font.boldSystemFont(fam === 'small' ? 14 : 16); n.textColor = white; n.lineLimit = 2; n.minimumScaleFactor = 0.8;
    addCountdown(w, st.next.s, fam === 'small' ? 13 : 14, amber);
    if (st.next.w && st.next.w.length && fam !== 'small') { const wn = w.addText('⚠️ ' + st.next.w[0]); wn.font = Font.systemFont(11); wn.textColor = new Color('#ffd0c0'); wn.lineLimit = 1; }
  } else {
    const t = w.addText('今天行程跑完了 🌙'); t.textColor = white; t.font = Font.mediumSystemFont(14);
  }

  if (fam === 'large' && st.upcoming.length > 1) {
    w.addSpacer(8);
    for (const it of st.upcoming.slice(1, 7)) {
      const r = w.addText(`${it.t}  ${ICON[it.k] || '•'} ${it.n}`); r.font = Font.systemFont(12); r.textColor = soft; r.lineLimit = 1;
    }
  }
  w.addSpacer();
  if (st.sky && fam !== 'small') {
    const row = w.addStack(); row.centerAlignContent();
    const s = row.addText(`${st.sky.n} ${st.sky.t}・`); s.font = Font.systemFont(11); s.textColor = soft;
    const d = row.addDate(st.sky.d); d.applyRelativeStyle(); d.font = Font.systemFont(11); d.textColor = soft;
  }
  // 下一個時間點到了就請 iOS 重畫
  const marks = [st.cur && st.cur.eD, st.next && st.next.s, st.sky && st.sky.d].filter(Boolean).sort((a, b) => a - b);
  w.refreshAfterDate = marks[0] || new Date(now.getTime() + 30 * 60e3);
  return w;
}

const widget = await build();
if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
