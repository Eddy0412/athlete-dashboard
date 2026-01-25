(function () {
  "use strict";
  // Global namespace (single export surface)
  const ACD = (window.ACD = window.ACD || {});
  ACD.version = ACD.version || "1.0.123";

  // Boot guard: prevents double-initialization if scripts are injected twice
  if (ACD._booted) return;
  ACD._booted = true;

// FULL production build (v1.0.118 baseline)
const IS_DEMO = false;


// View modes: default FULL, optional public view via ?view=public
const VIEW_MODE = (new URLSearchParams(window.location.search).get('view') || '').toLowerCase();
const IS_PUBLIC_VIEW = VIEW_MODE === 'public';
const IS_MEDIA_VIEW = VIEW_MODE === 'media';
const IS_PRO_VIEW = VIEW_MODE === 'pro';

// Guard: Media pill only for Media VIEW (?view=media), not Media Mode toggle
try{
  const mpGuard = document.getElementById("mediaPill");
  if (mpGuard && !IS_MEDIA_VIEW) mpGuard.style.display = "none";
}catch(e){}
if (IS_MEDIA_VIEW) { document.documentElement.classList.add('mediaView'); }

if (IS_MEDIA_VIEW) {
  try{
    const mpInit = document.getElementById("mediaPill");
    if (mpInit) mpInit.style.display = "inline-flex";
    const apInit = document.getElementById("adminPill");
    if (apInit) apInit.style.display = "none";
  }catch(e){}
}

if (IS_PUBLIC_VIEW) {
  document.documentElement.classList.add('publicView');
  const pp = document.getElementById('publicPill');
  if (pp) pp.style.display = 'inline-flex';
}

if (IS_PRO_VIEW) {
  document.documentElement.classList.add('proView');
  const pr = document.getElementById('proPill');
  if (pr) pr.style.display = 'inline-flex';
}
// Admin pill (default view)
try{
  const ap = document.getElementById("adminPill");
  if (ap) ap.style.display = (!IS_PUBLIC_VIEW && !IS_MEDIA_VIEW && !IS_PRO_VIEW) ? "inline-flex" : "none";
}catch(e){}

/** ---------- Config: map your CSV columns here ---------- **/
const COL = {
  id: "Formulario#",
  name: "Nombre",
  age: "Edad",
  dob: "Fecha de Nacimiento",
  weight: "Peso",
  height: "Estatura",
  phone: "Celular",
  address: "Direccion",
  school: "Lugar de Estudios",
  email: "Email",

  // Attempt 1:
  dash40_1: "40 YDS DASH (SEGUNDOS)",
  broad_1: "BROAD JUMP (PULGADAS)",
  shuttle_1: "5-10-5 (SHUTTLE) RUN",
  cone_1: "3- CONE DRILL",
  bench_1: "BENCHPRESS",

  // Attempt 2:
  dash40_2: "40 YDS DASH (SEGUNDOS) 2da Vuelta",
  broad_2: "BROAD JUMP (PULGADAS) 2da Vuelta",
  shuttle_2: "5-10-5 (SHUTTLE) RUN 2da Vuelta",
  cone_2: "3- CONE DRILL 2da Vuelta",
  bench_2: "BENCH PRESS 2da Vuelta",
};

// Photo CDN (Bluehost) - expects filenames like 002.jpg
const PHOTO_BASE_URL = "https://media.kkmsports.xyz/athletes/";

function padId(id){
  const s = String(id).trim();
  if (!s) return s;
  if (/^0\d+/.test(s)) return s;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0) return String(Math.trunc(n)).padStart(3, "0");
  return s;
}



const METRICS = [
  { key:"dash40", label:"40yd", unit:"s", better:"lower", a1:COL.dash40_1, a2:COL.dash40_2 },
  { key:"broad",  label:"Broad Jump", unit:"in", better:"higher", a1:COL.broad_1, a2:COL.broad_2 },
  { key:"shuttle",label:"5-10-5", unit:"s", better:"lower", a1:COL.shuttle_1, a2:COL.shuttle_2 },
  { key:"cone",   label:"3-Cone", unit:"s", better:"lower", a1:COL.cone_1, a2:COL.cone_2 },
  { key:"bench",  label:"Bench", unit:"reps", better:"higher", a1:COL.bench_1, a2:COL.bench_2 },
];

/** ---------- State ---------- **/
let rows = [];
let filtered = [];
let activeIndex = -1;
let sourceLabel = "—";

let radarChart = null;
let barChart = null;

const posOverrides = new Map();

/** ---------- Intelligence (v1.0.121) ---------- **/
let SORT_KEY = "name";
let POP_CACHE = {};      // metricKey -> array of best values across population
let INTEL_CACHE = [];

/** ---------- Watchlist + Notes (v1.0.122) ---------- **/
const WATCH_STORE_KEY = "acd_watchlist_v1";
let WATCH = {}; // id -> { starred:bool, notes:string }
let WATCH_ONLY = false;

function loadWatch(){
  try{
    const raw = localStorage.getItem(WATCH_STORE_KEY);
    WATCH = raw ? JSON.parse(raw) : {};
  } catch(e){ WATCH = {}; }
}
function saveWatch(){
  try{ localStorage.setItem(WATCH_STORE_KEY, JSON.stringify(WATCH)); } catch(e){}
}
function wlIdFromRow(r){
  const idRaw = r && r[COL.id] ? String(r[COL.id]).trim() : "";
  return padId(idRaw || "");
}
function wlIsStarred(id){ return !!(WATCH && WATCH[id] && WATCH[id].starred); }
function wlSetStar(id, on){
  if (!id) return;
  if (!WATCH[id]) WATCH[id] = { starred:false, notes:"" };
  WATCH[id].starred = !!on;
  saveWatch();
}
function wlSetNotes(id, notes){
  if (!id) return;
  if (!WATCH[id]) WATCH[id] = { starred:false, notes:"" };
  WATCH[id].notes = String(notes || "");
  saveWatch();
}
function updateWatchCountPill(){
  const pill = document.getElementById("watchCountPill");
  if (!pill) return;
  const cnt = Object.keys(WATCH||{}).filter(k => WATCH[k] && WATCH[k].starred).length;
  pill.textContent = `${WATCH_ONLY ? "★" : "☆"} Watchlist: ${cnt}`;
  pill.style.display = "inline-flex";
  pill.style.opacity = cnt ? "1" : ".8";
  pill.classList.toggle("watchOn", WATCH_ONLY);
}


function initWatchlistPillBtn(){
  const pill = document.getElementById("watchCountPill");
  if (pill && !pill._bound){
    pill._bound = true;
    pill.addEventListener("click", ()=>{
      WATCH_ONLY = !WATCH_ONLY;
      pill.classList.toggle("watchOn", WATCH_ONLY);
      updateWatchCountPill();
  initWatchlistPillBtn();
      applyFilter();
    });
  }
}



function initWatchlistUI(){
  const wfb = document.getElementById("watchFilterBtn");
  if (wfb && !wfb._bound){
    wfb._bound = true;
    wfb.addEventListener("click", ()=>{
      WATCH_ONLY = !WATCH_ONLY;
      wfb.classList.toggle("watchOn", WATCH_ONLY);
      wfb.textContent = WATCH_ONLY ? "★ Watchlist" : "☆ Watchlist";
      applyFilter();
    });
  }
}

function wlGetNotes(id){
  return (WATCH && WATCH[id] && typeof WATCH[id].notes === "string") ? WATCH[id].notes : "";
}

    // per row index: {best,pct,tier,score,strengths,flags}

const SCORE_WEIGHTS = { dash40:30, broad:20, shuttle:20, cone:15, bench:15 };

function tierFromPercentile(p){
  if (p === null || p === undefined) return { label:"—", cls:"tier-avg" };
  if (p >= 85) return { label:"Elite", cls:"tier-elite" };
  if (p >= 70) return { label:"Above Avg", cls:"tier-good" };
  if (p >= 40) return { label:"Average", cls:"tier-avg" };
  return { label:"Needs Work", cls:"tier-low" };
}

function athleticScore(pcts){
  let wSum = 0, sSum = 0;
  METRICS.forEach(m=>{
    const p = pcts[m.key];
    if (p === null || p === undefined) return;
    const w = SCORE_WEIGHTS[m.key] || 0;
    if (!w) return;
    wSum += w;
    sSum += p * w;
  });
  if (!wSum) return null;
  return Math.round(sSum / wSum);
}

function recomputeIntelligence(){
  // Build population arrays once per metric
  POP_CACHE = {};
  METRICS.forEach(m => {
    POP_CACHE[m.key] = computePopulationBest(m); // uses bestAttemptValue over rows
  });

  INTEL_CACHE = rows.map((r, idx) => {
    const best = {};
    const pct = {};
    const tier = {};
    METRICS.forEach(m=>{
      const b = bestAttemptValue(r, m);
      best[m.key] = b;
      const pop = POP_CACHE[m.key] || [];
      const p = percentileRank(pop, b, m.better);
      pct[m.key] = (p === null ? null : Math.max(0, Math.min(100, p)));
      tier[m.key] = tierFromPercentile(pct[m.key]);
    });

    const score = athleticScore(pct);

    // Strengths & Flags
    const strengths = [];
    const flags = [];
    METRICS.forEach(m=>{
      const p = pct[m.key];
      if (p === null){
        flags.push(`Missing ${m.label}`);
        return;
      }
      if (p >= 70) strengths.push(`${m.label}: Top ${Math.max(1, Math.round(100 - p))}%`);
      if (p <= 35) flags.push(`${m.label}: Bottom ${Math.max(1, Math.round(p))}%`);
    });

    return {
      best, pct, tier,
      score,
      strengths: strengths.slice(0,3),
      flags: flags.slice(0,3),
    };
  });
}

function sortComparator(a, b){
  // a/b are {r, idx}
  if (SORT_KEY === "name"){
    return normalizeStr(a.r[COL.name]).localeCompare(normalizeStr(b.r[COL.name]));
  }
  const ai = INTEL_CACHE[a.idx] || {};
  const bi = INTEL_CACHE[b.idx] || {};

  if (SORT_KEY === "score"){
    const av = ai.score, bv = bi.score;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av; // high first
  }

  // metric sort
  const m = METRICS.find(x => x.key === SORT_KEY);
  if (!m) return 0;
  const av = ai.best ? ai.best[SORT_KEY] : null;
  const bv = bi.best ? bi.best[SORT_KEY] : null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (m.better === "lower") ? (av - bv) : (bv - av);
}

 // athleteId -> manual position

/** ---------- Photos (local folder) ---------- **/
let photoMap = new Map(); // key (Formulario#) -> objectURL

function keyFromFilename(name){
  return String(name).toLowerCase().replace(/\.[^.]+$/, "").trim();
}

function photoKeyForRow(r){
  // Match by Formulario#.
  const idRaw = String(r[COL.id] ?? "").trim();
  if (!idRaw) return "";
  // Prefer 3-digit padding to match CDN filenames like 002.jpg
  return padId(idRaw).toLowerCase();
}

function photoUrlForRow(r){
  const idRaw = String(r[COL.id] ?? "").trim();
  if (!idRaw) return null;

  // 1) Local folder photos (if loaded)
  const keyPadded = padId(idRaw).toLowerCase();
  const keyRaw = idRaw.toLowerCase();
  const local = photoMap.get(keyPadded) || photoMap.get(keyRaw);
  if (local) return local;

  // 2) CDN fallback
  if (typeof PHOTO_BASE_URL === "string" && PHOTO_BASE_URL.trim().length){
    return PHOTO_BASE_URL + padId(idRaw) + ".jpg";
  }

  return null;
}


function updateLargePhoto(r){
  const url = photoUrlForRow(r);

  const placeholder = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted)">No photo</div>`;

  function fillBox(box){
    if (!box) return;
    if (!url){
      box.innerHTML = placeholder;
      return;
    }
    box.innerHTML = "";
    const img = new Image();
    img.src = url;
    img.alt = "Athlete photo";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.onerror = () => { box.innerHTML = placeholder; };
    box.appendChild(img);
  }

  fillBox(document.getElementById("athletePhotoLarge"));
  fillBox(document.getElementById("athletePhotoScout"));
}

/** ---------- Helpers ---------- **/
const $ = (id) => document.getElementById(id);

function toNum(v){
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatWeightLbsRounded(v){
  const n = typeof v === "number"
    ? v
    : parseFloat(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)} lbs`;
}

function formatHeightFeetInches(v){
  if (v === null || v === undefined) return "—";

  const sRaw = String(v).trim();
  if (!sRaw) return "—";

  // If already formatted like 5'10" (or 5' 10"), keep as-is (trim only)
  if (/[0-9]\s*'/.test(sRaw)) return sRaw;

  const lower = sRaw.toLowerCase();

  // Common human-entered patterns:
  //  - 5-10, 5 10, 5ft 10in, 5’10 (curly)
  //  - 5.10 meaning 5 feet 10 inches (common in spreadsheets)
  //  - 70 (inches) / 178cm / 1.78m
  const mDash = sRaw.match(/^\s*(\d)\s*[- ]\s*(\d{1,2})\s*$/);
  if (mDash){
    const ft = parseInt(mDash[1], 10);
    const inch = parseInt(mDash[2], 10);
    if (ft >= 3 && ft <= 8 && inch >= 0 && inch <= 11) return `${ft}'${inch}"`;
  }

  const mDot = sRaw.match(/^\s*(\d)\s*\.\s*(\d{1,2})\s*$/);
  if (mDot){
    const ft = parseInt(mDot[1], 10);
    const inch = parseInt(mDot[2], 10);
    // Treat 5.10 as 5'10" (only when it looks like feet + inches, not meters)
    if (!lower.includes("m") && ft >= 3 && ft <= 8 && inch >= 0 && inch <= 11){
      return `${ft}'${inch}"`;
    }
  }

  // Extract first number (supports "70", "70 in", "178cm", "1.78m")
  const numMatch = sRaw.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!numMatch) return "—";
  let n = parseFloat(numMatch[0]);
  if (!Number.isFinite(n)) return "—";

  // Heuristics for unit conversion (minimal & safe)
  let inches = n;

  // centimeters
  if (lower.includes("cm") || (!lower.includes("in") && !lower.includes('"') && !lower.includes("ft") && n >= 120 && n <= 260)){
    inches = n / 2.54;
  } else if (lower.includes("m") && n > 1.2 && n < 2.6){
    // meters to inches (e.g., 1.78m)
    inches = (n * 100) / 2.54;
  } else if (n >= 40 && n <= 96){
    // looks like inches already (typical athlete range)
    inches = n;
  } else if (n >= 4 && n <= 8 && !lower.includes("m")){
    // plain feet value like "6" -> 6'0"
    inches = n * 12;
  }

  const totalIn = Math.round(inches);
  if (!Number.isFinite(totalIn) || totalIn <= 0) return "—";

  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  if (ft <= 0) return "—";
  return `${ft}'${inch}"`;
}

function normalizeStr(s){
  return String(s ?? "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function percentileRank(values, value, better){
  // values: array of numbers (non-null)
  // return 0..100 percentile (higher = better)
  if (!values.length || value === null) return null;
  const sorted = values.slice().sort((a,b)=>a-b);
  // rank position via binary search insertion index
  let lo = 0, hi = sorted.length;
  while (lo < hi){
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  const countLess = lo;
  const pct = (countLess / sorted.length) * 100;
  // For better=lower: invert (lower time => higher percentile)
  return better === "lower" ? (100 - pct) : pct;
}

function formatMetric(m, v){
  if (v === null) return "—";
  if (m.unit === "s") return v.toFixed(2) + " " + m.unit;
  if (m.unit === "in") return Math.round(v) + " " + m.unit;
  if (m.unit === "reps") return Math.round(v) + " " + m.unit;
  return String(v);
}

function badgeForPercentile(p){
  if (p === null) return `<span class="badge warn">No rank</span>`;
  if (p >= 75) return `<span class="badge good">Top quartile</span>`;
  if (p >= 40) return `<span class="badge warn">Mid pack</span>`;
  return `<span class="badge bad">Needs work</span>`;
}

function safe(v){ return (v === null || v === undefined || v === "") ? "—" : String(v); }

/** ---------- CSV Loading ---------- **/
function setStatus(text){
  $("statusPill").textContent = text;
}

function setSource(text){
  sourceLabel = text;
  $("dataSourcePill").textContent = text;
}

function parseCsvText(csvText, label){
  setStatus("Parsing…");
  Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      rows = (res.data || []).filter(r => normalizeStr(r[COL.name] || "").length);
      // Clean up: convert numeric metric columns to numbers
      rows.forEach(r => {
        METRICS.forEach(m => {
          r[m.a1] = toNum(r[m.a1]);
          r[m.a2] = toNum(r[m.a2]);
        });
        r[COL.age] = toNum(r[COL.age]);
        r[COL.weight] = toNum(r[COL.weight]);
      });
      setSource(label);
      setStatus("Loaded");
      recomputeIntelligence();
      render();
      // Auto-select first athlete
      if (rows.length) selectAthlete(0);
    },
    error: (err) => {
      console.error(err);
      setStatus("Error");
      alert("Could not parse CSV. Check the file format.");
    }
  });
}

async function loadDefaultCsv(){
  // Keep behavior aligned with v1.0.116 (simple fetch + parse),
  // but make the URL GitHub Pages-safe when the page is opened with a trailing "?" or other querystrings.
  try{
    setStatus("Loading…");

    const baseHref = window.location.origin + window.location.pathname;
    const resultsUrl = new URL("./results.csv", baseHref).toString();

    const res = await fetch(resultsUrl, { cache: "no-store" });
    if(!res.ok) throw new Error("results.csv not found");

    const text = await res.text();
    parseCsvText(text, "results.csv");
  }catch(e){
    console.warn(e);

    // Avoid false-negative alerts: parsing/loading can still complete asynchronously,
    // or data may already be present from a previous successful load.
    setStatus("Loading…");

    // Give the app a moment to populate rows; only alert if it's still empty.
    setTimeout(() => {
      try{
        if (Array.isArray(rows) && rows.length > 0){
          setStatus("Ready");
          return;
        }
      }catch(_){}
      setStatus("No results.csv");
      alert("Couldn't load results.csv. Put it next to this HTML file, or use the Load CSV button.");
    }, 800);
  }
}

/** ---------- Rendering ---------- **/
function render(){
  $("athleteCount").textContent = `${rows.length} loaded`;
  applyFilter();
}

function applyFilter(){
  const q = normalizeStr($("search").value);
  filtered = rows
    .map((r, idx) => ({ r, idx }))
    .filter(x => normalizeStr(x.r[COL.name]).includes(q))
    .filter(x => !WATCH_ONLY || wlIsStarred(wlIdFromRow(x.r)))
    .sort(sortComparator);
  renderTable();
}




function initialsForRow(r){
  const full = String(r[COL.name] ?? "").trim();
  if (!full) return "—";
  const parts = full.split(/\s+/).filter(Boolean);
  const a = (parts[0] || "").slice(0,1).toUpperCase();
  const b = (parts.length>1 ? parts[parts.length-1] : "").slice(0,1).toUpperCase();
  return (a + b) || a || "—";
}

function renderTable(){
  const tb = $("athleteTable");
  tb.innerHTML = "";
  filtered.forEach((x, i) => {
    const r = x.r;
    const tr = document.createElement("tr");
    tr.dataset.idx = x.idx;
    if (x.idx === activeIndex) tr.classList.add("active");
    const url = photoUrlForRow(r);
    tr.innerHTML = `
      <td>
        <div style="display:flex;gap:10px;align-items:center">
          <div class="avatarBox" style="width:34px;height:34px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)">
            ${url ? `<img class="avatarImg" data-initials="${initialsForRow(r)}" src="${url}" style="width:100%;height:100%;object-fit:cover" />` : `<div class="avatarInitials">${initialsForRow(r)}</div>`}
          </div>
          <strong>${safe(r[COL.name])}</strong>
        </div>
      </td>
      <td data-label="Age">${safe(r[COL.age])}</td>
      <td data-label="Weight">${safe(r[COL.weight])}</td>
      <td data-label="School">${safe(r[COL.school])}</td>
    `;
    tr.addEventListener("click", () => selectAthlete(x.idx));
    tb.appendChild(tr);
  });
  applyAvatarFallback();  initWatchlistPillBtn();
}


function bestAttemptValue(r, m){
  const v1 = r[m.a1];
  const v2 = r[m.a2];
  if (v1 === null && v2 === null) return null;
  if (v1 === null) return v2;
  if (v2 === null) return v1;
  return (m.better === "lower") ? Math.min(v1, v2) : Math.max(v1, v2);
}

function norm01(value, min, max, invert=false){
  if (value === null || value === undefined) return null;
  const v = Math.max(min, Math.min(max, value));
  const n = (v - min) / (max - min);
  return invert ? (1 - n) : n;
}

// Simple offline "AI-like" heuristic based on combine patterns.
// Output: {pos, reason}
function suggestPosition(row){
  // pull best attempts
  const best = {};
  METRICS.forEach(m => best[m.key] = bestAttemptValue(row, m));
  const w = toNum(row[COL.weight]);
  const hStr = String(row[COL.height] ?? "").trim();

  // normalize (tuned for typical HS combine ranges; adjust later with real data)
  const speed = norm01(best.dash40, 4.4, 6.0, true);        // faster -> higher
  const explos = norm01(best.broad, 70, 130, false);        // higher -> higher
  const agility = (() => {
    const sh = norm01(best.shuttle, 3.9, 5.5, true);
    const co = norm01(best.cone, 6.5, 9.2, true);
    if (sh === null && co === null) return null;
    if (sh === null) return co;
    if (co === null) return sh;
    return (sh + co) / 2;
  })();
  const strength = norm01(best.bench, 0, 30, false);        // higher -> higher

  const heavy = (w !== null && w >= 210);
  const veryHeavy = (w !== null && w >= 250);

  // Scores per position group (very rough, but useful for an initial tag)
  const scores = {
    WR: (speed??0)*0.45 + (agility??0)*0.25 + (explos??0)*0.25 + (strength??0)*0.05,
    DB: (speed??0)*0.40 + (agility??0)*0.35 + (explos??0)*0.20 + (strength??0)*0.05,
    RB: (speed??0)*0.30 + (agility??0)*0.30 + (explos??0)*0.25 + (strength??0)*0.15,
    LB: (speed??0)*0.25 + (agility??0)*0.20 + (explos??0)*0.20 + (strength??0)*0.35 + (heavy?0.05:0),
    TE: (speed??0)*0.20 + (agility??0)*0.15 + (explos??0)*0.20 + (strength??0)*0.45 + (heavy?0.05:0),
    OL: (speed??0)*0.10 + (agility??0)*0.10 + (explos??0)*0.15 + (strength??0)*0.65 + (veryHeavy?0.10:0),
    DL: (speed??0)*0.15 + (agility??0)*0.10 + (explos??0)*0.20 + (strength??0)*0.55 + (veryHeavy?0.10:0),
    QB: (speed??0)*0.20 + (agility??0)*0.35 + (explos??0)*0.20 + (strength??0)*0.25,
    "K/P": (speed??0)*0.20 + (agility??0)*0.20 + (explos??0)*0.30 + (strength??0)*0.30
  };

  // Weight nudges
  if (veryHeavy){ scores.OL += 0.10; scores.DL += 0.08; scores.WR -= 0.08; scores.DB -= 0.08; }
  if (heavy && !veryHeavy){ scores.LB += 0.06; scores.TE += 0.05; }

  // pick best
  let bestPos = "WR", bestScore = -1;
  for (const [k,v] of Object.entries(scores)){
    if (v > bestScore){ bestScore = v; bestPos = k; }
  }

  // Build a short reason (no "real AI" claim; just heuristic)
  const parts = [];
  if (speed !== null) parts.push(`speed ${Math.round(speed*100)}`);
  if (agility !== null) parts.push(`agility ${Math.round(agility*100)}`);
  if (strength !== null) parts.push(`strength ${Math.round(strength*100)}`);
  if (explos !== null) parts.push(`explosiveness ${Math.round(explos*100)}`);
  if (w !== null) parts.push(`weight ${Math.round(w)}lb`);

  return { pos: bestPos, reason: parts.slice(0,3).join(" • ") };
}

function setPosBadge(pos, mode="auto"){
  const b = document.getElementById("athletePosBadge");
  if (!b) return;
  b.textContent = `${pos || "—"}`;
  // slight style change for manual
  if (mode === "manual"){
    b.style.borderColor = "rgba(84,113,183,.45)";
    b.style.background = "rgba(84,113,183,.22)";
  } else {
    b.style.borderColor = "rgba(9,167,212,.35)";
    b.style.background = "rgba(9,167,212,.18)";
  }
}


function computePopulationBest(m){
  const vals = [];
  rows.forEach(r => {
    const v = bestAttemptValue(r, m);
    if (v !== null) vals.push(v);
  });
  return vals;
}

function selectAthlete(originalIdx){
  activeIndex = originalIdx;
  renderTable();

  const r = rows[originalIdx];
  const intel = INTEL_CACHE[originalIdx] || null;

  // Watchlist + Notes (v1.0.122)
  const wlId = wlIdFromRow(r);
  const watchBtn = document.getElementById("watchBtn");
  const notesBox = document.getElementById("notesBox");
  const notesSaved = document.getElementById("notesSaved");

  if (watchBtn){
    const on = wlIsStarred(wlId);
    watchBtn.textContent = on ? "★ Watching" : "☆ Watch";
    watchBtn.classList.toggle("watchOn", on);
    watchBtn.onclick = () => {
      const now = !wlIsStarred(wlId);
      wlSetStar(wlId, now);
      updateWatchCountPill();
  initWatchlistUI();
      watchBtn.textContent = now ? "★ Watching" : "☆ Watch";
      watchBtn.classList.toggle("watchOn", now);
      applyFilter();
    };
  }

  if (notesBox){
    notesBox.value = wlGetNotes(wlId);
    let tmr = null;
    notesBox.oninput = () => {
      if (tmr) clearTimeout(tmr);
      if (notesSaved) notesSaved.style.display = "none";
      tmr = setTimeout(() => {
        wlSetNotes(wlId, notesBox.value);
        if (notesSaved){
          notesSaved.style.display = "block";
          setTimeout(()=>{ notesSaved.style.display = "none"; }, 900);
        }
      }, 300);
    };
  }

  const photoUrl = photoUrlForRow(r);
  $("athleteName").textContent = safe(r[COL.name]);
$("athleteMeta").textContent = `Age ${safe(r[COL.age])} • ${formatHeightFeetInches(r[COL.height])} • ${safe(r[COL.weight])} lb • ${safe(r[COL.school])}`;
  updateLargePhoto(r);
  // Athletic Score pill (v1.0.121)
  const scorePill = document.getElementById("scorePill");
  if (scorePill){
    const s = intel && intel.score !== null && intel.score !== undefined ? String(intel.score) : "—";
    scorePill.textContent = `Score ${s}`;
    scorePill.style.display = (s === "—") ? "none" : "inline-flex";
  }


  // ID badge
  const idBadge = document.getElementById("athleteIdBadge");
  const athleteId = String(r[COL.id] ?? "").trim();
  if (idBadge) idBadge.textContent = athleteId ? `#${athleteId}` : "#—";
  // Scout badges (Formulario# + suggested position)
  const idBadgeS = document.getElementById("athleteIdBadgeScout");
  if (idBadgeS) idBadgeS.textContent = athleteId ? `#${athleteId}` : "#—";

  // Suggested/selected position (reuse same logic as dashboard)
  let posValue = "—";
  try{
    const autoS = (typeof suggestPosition === "function") ? suggestPosition(r) : {pos:"—", reason:""};
    const manualS = (athleteId && typeof posOverrides !== "undefined" && posOverrides.has(athleteId)) ? posOverrides.get(athleteId) : "";
    posValue = (manualS || autoS.pos || "—");
  }catch(e){}
  const posBadgeS = document.getElementById("athletePosBadgeScout");
  if (posBadgeS) posBadgeS.textContent = posValue;

  // Scout contact details (mapped from CSV)
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (val === null || val === undefined || String(val).trim() === "") ? "—" : String(val).trim();
  };

  const formatLbs = (val) => {
    if (val === null || val === undefined) return "—";
    const s = String(val).trim();
    if (!s) return "—";
    // Avoid double-units if CSV already includes them
    if (/\b(lb|lbs|pounds|kg|kgs)\b/i.test(s)) return s;
    // If numeric-ish, append lbs
    return s + " lbs";
  };

  setText("scoutDob", r[COL.dob]);
  setText("scoutAge", r[COL.age]);
  //setText("scoutHeight", r[COL.height]);
  setText("scoutHeight", formatHeightFeetInches(r[COL.height]));
  //setText("scoutWeight", formatLbs(r[COL.weight]));
  setText("scoutWeight", formatWeightLbsRounded(r[COL.weight]));
  setText("scoutPhone", r[COL.phone]);
  setText("scoutEmail", r[COL.email]);



  // Position (manual override > auto)
  const sel = document.getElementById("posSelect");
  const explain = document.getElementById("posExplain");
  const manual = athleteId && posOverrides.has(athleteId) ? posOverrides.get(athleteId) : "";
  if (sel) sel.value = manual || "";
  const auto = suggestPosition(r);
  const pos = manual || auto.pos;
  setPosBadge(pos, manual ? "manual" : "auto");
  if (explain) explain.textContent = manual ? "(manual)" : `(auto: ${auto.reason})`;

  $("dataSourcePill").textContent = sourceLabel;

  // KPI cards
  const kpis = $("kpis");
  kpis.innerHTML = "";
  METRICS.forEach(m => {
    const best = bestAttemptValue(r, m);
    const pop = computePopulationBest(m);
    const p = percentileRank(pop, best, m.better);
    const el = document.createElement("div");
    el.className = "kpi";
    el.innerHTML = `
      <div class="label">${m.label}</div>
      <div class="value">${formatMetric(m, best)}</div>
      <div class="meta">Percentile: <strong>${p===null ? "—" : Math.round(p)}</strong> ${badgeForPercentile(p)}</div>
    `;
    kpis.appendChild(el);
  });

  // Attempts table
  const attempts = $("attempts");
  attempts.innerHTML = "";
  METRICS.forEach(m => {
    const v1 = r[m.a1], v2 = r[m.a2];
    const best = bestAttemptValue(r, m);
    const a1 = (v1 === null) ? "—" : formatMetric(m, v1);
    const a2 = (v2 === null) ? "—" : formatMetric(m, v2);
    const b  = (best === null) ? "—" : formatMetric(m, best);
    const used = (best === null) ? "" : (best === v1 ? "Attempt 1" : "Attempt 2");
    const box = document.createElement("div");
    box.style.marginBottom = "10px";
    box.style.padding = "10px";
    box.style.border = "1px solid rgba(30,42,60,.9)";
    box.style.borderRadius = "14px";
    box.style.background = "rgba(255,255,255,.02)";
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div style="font-weight:800">${m.label}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="tierPill ${(intel && intel.tier && intel.tier[m.key]) ? intel.tier[m.key].cls : 'tier-avg'}">${(intel && intel.tier && intel.tier[m.key]) ? intel.tier[m.key].label : '—'}</span>
          <span class="small muted">${(intel && intel.pct && intel.pct[m.key] !== null && intel.pct[m.key] !== undefined) ? (Math.round(intel.pct[m.key]) + '%') : '—'}</span>
          <span class="small muted">${used ? "Best = " + used : ""}</span>
        </div>
      </div>
      <div class="small" style="margin-top:6px">
        <div>Attempt 1: <span class="mono">${a1}</span></div>
        <div>Attempt 2: <span class="mono">${a2}</span></div>
        <div style="margin-top:6px">Best: <strong class="mono">${b}</strong></div>
      </div>
    `;
    attempts.appendChild(box);
  });


  // Strengths & Flags (v1.0.121)
  const ulS = document.getElementById("intelStrengths");
  const ulF = document.getElementById("intelFlags");
  if (ulS) ulS.innerHTML = "";
  if (ulF) ulF.innerHTML = "";
  const strengths = (intel && intel.strengths) ? intel.strengths : [];
  const flags = (intel && intel.flags) ? intel.flags : [];

  const makeLi = (icon, text, toneCls) => {
    const li = document.createElement("li");
    if (toneCls) li.className = toneCls;
    const ic = document.createElement("span");
    ic.className = "sfIcon";
    ic.setAttribute("aria-hidden","true");
    ic.textContent = icon;
    const tx = document.createElement("span");
    tx.textContent = text;
    li.appendChild(ic);
    li.appendChild(tx);
    return li;
  };

  if (ulS){
    if (!strengths.length){
      ulS.innerHTML = "<li class=\"muted\">—</li>";
    } else {
      strengths.forEach(t => { ulS.appendChild(makeLi("✅", t, "sfGood")); });
    }
  }
  if (ulF){
    if (!flags.length){
      ulF.innerHTML = "<li class=\"muted\">—</li>";
    } else {
      flags.forEach(t => { ulF.appendChild(makeLi("⚠️", t, "sfWarn")); });
    }
  }

// Charts
  renderRadar(r);
  renderBars(r);

  // Sync selection to Presenter
  try{ _pushToPresenter(r); }catch(e){}

}

function renderRadar(r){
  const labels = METRICS.map(m => m.label);
  const data = METRICS.map(m => {
    const best = bestAttemptValue(r, m);
    const pop = computePopulationBest(m);
    const p = percentileRank(pop, best, m.better);
    return p === null ? 0 : Math.max(0, Math.min(100, p));
  });

  const ctx = $("radar").getContext("2d");
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Percentile",
        data,
        fill: true,
        borderWidth: 2,
        pointRadius: 3,
      }]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { backdropColor: "transparent", color: "rgba(232,240,255,.75)" },
          grid: { color: "rgba(138,160,182,.22)" },
          angleLines: { color: "rgba(138,160,182,.22)" },
          pointLabels: { color: "rgba(232,240,255,.9)", font: { size: 12, weight: "Peso" } }
        }
      },
      plugins: {
        legend: { labels: { color: "rgba(232,240,255,.85)" } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${Math.round(ctx.parsed.r)}th percentile`
          }
        }
      }
    }
  });
}

function renderBars(r){
  const labels = METRICS.map(m => `${m.label} (${m.unit})`);
  const values = METRICS.map(m => bestAttemptValue(r, m) ?? 0);

  const ctx = $("bars").getContext("2d");
  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Best attempt value",
        data: values,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "rgba(232,240,255,.85)" } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: { ticks: { color: "rgba(232,240,255,.85)" }, grid: { color: "rgba(138,160,182,.16)" } },
        y: { ticks: { color: "rgba(232,240,255,.85)" }, grid: { color: "rgba(138,160,182,.16)" } }
      }
    }
  });
}

/** ---------- Events ---------- **/

// Position tooltip toggle
const posInfoBtn = document.getElementById("posInfoBtn");
const posTooltip = document.getElementById("posTooltip");
if (posInfoBtn && posTooltip){
  posInfoBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    const open = posTooltip.style.display !== "none";
    posTooltip.style.display = open ? "none" : "block";
  });
  document.addEventListener("click", ()=>{ posTooltip.style.display = "none"; });
  posTooltip.addEventListener("click", (e)=> e.stopPropagation());
}


// Manual position override (stored locally in-memory)
const posSel = document.getElementById("posSelect");
if (posSel){
  posSel.addEventListener("change", ()=>{
    if (activeIndex < 0) return;
    const r = rows[activeIndex];
    const athleteId = String(r[COL.id] ?? "").trim();
    if (!athleteId) return;

    const v = String(posSel.value ?? "").trim();
    if (!v){
      posOverrides.delete(athleteId);
    } else {
      posOverrides.set(athleteId, v);
    }

    const auto = suggestPosition(r);
    const pos = v || auto.pos;
    setPosBadge(pos, v ? "manual" : "auto");

    const explain = document.getElementById("posExplain");
    if (explain) explain.textContent = v ? "(manual)" : `(auto: ${auto.reason})`;
  });
}



$("photos").addEventListener("change", (e) => {
  photoMap.clear();
  const files = e.target.files ? Array.from(e.target.files) : [];
  for (const f of files) {
    const key = keyFromFilename(f.name);
    if (key) photoMap.set(key, URL.createObjectURL(f));
  }
  // Re-render list and refresh selected athlete
  renderTable();
  if (rows.length && activeIndex < 0) { selectAthlete(0); }
  else if (activeIndex >= 0) { selectAthlete(activeIndex); }
});

$("file").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => parseCsvText(reader.result, f.name);
  reader.readAsText(f);
});

$("search").addEventListener("input", applyFilter);
$("loadDefault").addEventListener("click", loadDefaultCsv);
// Presentation window sync (index controls, external fullscreen presenter)
// Most reliable: parent updates presenter URL hash on selection + persists latest athlete to localStorage.
let _presentWin = null;
function getPresenterTpl(){
  try{
    const v = sessionStorage.getItem("presentTpl") || "default";
    return (v === "kfl") ? "kfl" : "default";
  }catch(e){ return "default"; }
}

const PRES_KEY = "ac_presenter_current_athlete";

function _presentKeyForRow(r){
  try{
    const k = r?.[COL.frm] ?? r?.["Formulario#"] ?? r?.["Formulario"] ?? r?.["ID"] ?? r?.["Id"] ?? r?.["id"];
    if(k !== undefined && k !== null && String(k).trim() !== "") return String(k);
  }catch(e){}
  try{
    if(typeof activeIndex === "number") return String(activeIndex);
  }catch(e){}
  return "";
}

function rowToPresenter(r){
  // minimize + stabilize payload for storage
  const key = _presentKeyForRow(r);
  const base = {};
  try{
    // shallow copy row values
    for (const k in r) base[k] = r[k];
  }catch(e){}
  base._presentKey = key;
  try{ base._photoUrl = (typeof photoUrlForRow === "function" ? photoUrlForRow(r) : ""); }catch(e){}
  return base;
}

function _persistPresenter(payload){
  try{
    localStorage.setItem(PRES_KEY, JSON.stringify(payload));
  }catch(e){}
}

function _updatePresenterHash(key){
  try{
    if(_presentWin && !_presentWin.closed){
      _presentWin.location.hash = "sel=" + encodeURIComponent(key || "" || "") + "&tpl=" + encodeURIComponent(getPresenterTpl());}
  }catch(e){}
}

function _pushToPresenter(r){
  if(!r) return;
  const athlete = rowToPresenter(r);
  const payload = { type: "ac_athlete_update", athlete };
  _persistPresenter(payload);
  _updatePresenterHash(athlete._presentKey);
}

$("presentBtn")?.addEventListener("click", () => {
  _presentWin = window.open("presentation.html#sel=&tpl=" + encodeURIComponent(getPresenterTpl()), "ac_presenter");
  // best-effort initial push
  setTimeout(() => {
    try{
      const r = rows?.[activeIndex];
      if(r) _pushToPresenter(r);
    }catch(e){}
  }, 250);
});


// Drag & drop
const dz = $("dropZone");
dz.addEventListener("dragover", (e)=>{ e.preventDefault(); dz.style.borderColor = "rgba(9,167,212,.8)"; });
dz.addEventListener("dragleave", ()=>{ dz.style.borderColor = "rgba(138,160,182,.45)"; });
dz.addEventListener("drop", (e)=>{
  e.preventDefault();
  dz.style.borderColor = "rgba(138,160,182,.45)";
  const f = e.dataTransfer.files?.[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => parseCsvText(reader.result, f.name);
  reader.readAsText(f);
});

// Optional: try auto-load if results.csv exists
// (works only when served via a local server; some browsers block fetch() for file://)

// Coach mode toggle (layout-only; mutually exclusive with Scout Mode)
const coachBtn = document.getElementById("toggleCoach");
function setCoachMode(on){
  if (on) { try{ setMediaMode(false); }catch(e){} }
  document.body.classList.toggle("coachMode", !!on);
  if (coachBtn) coachBtn.textContent = `Coach Mode: ${on ? "On" : "Off"}`;
  if (on) { document.body.classList.remove("scoutMode"); if (toggleBtn) toggleBtn.textContent = "Scout Mode: Off"; }
  
  // Profile title (Coach Mode uses Athlete Profile)
  const spt = document.getElementById("scoutProfileTitle");
  if (spt){
    if (!!on) spt.textContent = "Athlete Profile";
    else if (document.body.classList.contains("scoutMode")) spt.textContent = "Scout Profile";
    else if (document.body.classList.contains("mediaMode")) spt.textContent = "Media Profile";
    else spt.textContent = "Scout Profile";
  }

try{ sessionStorage.setItem("coachModeOn", on ? "1" : "0"); }catch(e){}
}
if (coachBtn){
  coachBtn.addEventListener("click", ()=>{
    const on = !document.body.classList.contains("coachMode");
    setCoachMode(on);
    if (document.body.classList.contains("drawerOpen")) closeDrawer();
  });
}
if (!IS_PUBLIC_VIEW) {
  try{ setCoachMode(sessionStorage.getItem("coachModeOn")==="1"); }catch(e){}
}

// Scout mode toggle (layout-only)
const toggleBtn = document.getElementById("toggleScout");
function setScoutMode(on){
  if (on) { try{ setMediaMode(false); }catch(e){} }
  if (on) { document.body.classList.remove("coachMode"); 
  // Profile title (Scout Mode label)
  const spt = document.getElementById("scoutProfileTitle");
  if (spt){
    if (!!on) spt.textContent = "Scout Profile";
    else if (document.body.classList.contains("coachMode")) spt.textContent = "Athlete Profile";
    else if (document.body.classList.contains("mediaMode")) spt.textContent = "Media Profile";
    else spt.textContent = "Scout Profile";
  }

try{ sessionStorage.setItem("coachModeOn","0"); }catch(e){} if (coachBtn) coachBtn.textContent = "Coach Mode: Off"; }

  document.body.classList.toggle("scoutMode", !!on);
  if (toggleBtn) toggleBtn.textContent = `Scout Mode: ${on ? "On" : "Off"}`;
  try{ sessionStorage.setItem("scoutModeOn", on ? "1" : "0"); }catch(e){}
}
if (toggleBtn){
  toggleBtn.addEventListener("click", ()=>{
    const on = !document.body.classList.contains("scoutMode");
    setScoutMode(on);
    if (document.body.classList.contains("drawerOpen")) closeDrawer();
  });
}
// restore mode
if (!IS_PUBLIC_VIEW) {
  try{ setScoutMode(sessionStorage.getItem("scoutModeOn")==="1"); }catch(e){}
}




// Pro view: default to Coach layout + intelligence UI (locked; no toggles)
if (IS_PRO_VIEW){
  try{ setMediaMode(false); }catch(e){}
  try{ setScoutMode(false); }catch(e){}
  try{ setCoachMode(true); }catch(e){}
}
// Media mode toggle (independent; used for shared/public-facing UI)
const mediaBtn = document.getElementById("toggleMedia");

const tplSel = document.getElementById("mediaTemplateSelect");
if (tplSel){
  // restore last selection
  try{ tplSel.value = getPresenterTpl(); }catch(e){}
  tplSel.addEventListener("change", ()=>{
    try{
      sessionStorage.setItem("presentTpl", tplSel.value || "default");
      // keep presenter URL in sync if it's open
      const r = rows?.[activeIndex];
      if (r) _updatePresenterHash(r._presentKey || r[COL.id] || "");
    }catch(e){}
  });
  // Hide in public view
  if (document.documentElement.classList.contains("publicView")) tplSel.style.display = "none";
}
let __prevScoutForMedia = null;
let __prevCoachForMedia = null;
function setMediaMode(on){
  let isOn = !!on;
  // In ?view=media, Media Mode is locked ON
  if (IS_MEDIA_VIEW && !isOn) { isOn = true; }

  // Preserve prior modes so toggling Media doesn't permanently change user state
  if (isOn){
    if (__prevScoutForMedia === null) __prevScoutForMedia = document.body.classList.contains("scoutMode");
    if (__prevCoachForMedia === null) __prevCoachForMedia = document.body.classList.contains("coachMode");
  }

  // Media Mode should be mutually exclusive with Scout/Coach
  if (isOn){
    try{ setScoutMode(false); }catch(e){}
    try{ setCoachMode(false); }catch(e){}
  }

  document.body.classList.toggle("mediaMode", isOn);
  if (mediaBtn) mediaBtn.textContent = `Media Mode: ${isOn ? "On" : "Off"}`;

  // Update profile title + pills
  const spt = document.getElementById("scoutProfileTitle");
  if (spt) spt.textContent = isOn ? "Media Profile" : "Scout Profile";
  const mp = document.getElementById("mediaPill"); if (mp && IS_MEDIA_VIEW) mp.style.display = "inline-flex";

  // Media Mode uses a Scout-like layout via CSS (body.mediaMode) but MUST NOT toggle Scout Mode itself.
  if (!isOn){
    // restore prior modes if we had them
    if (__prevScoutForMedia !== null) { try{ setScoutMode(!!__prevScoutForMedia); }catch(e){} }
    if (__prevCoachForMedia !== null) { try{ setCoachMode(!!__prevCoachForMedia); }catch(e){} }
    __prevScoutForMedia = null;
    __prevCoachForMedia = null;
  }

  try{ sessionStorage.setItem("mediaModeOn", isOn ? "1" : "0"); }catch(e){}
}
if (mediaBtn){
  mediaBtn.addEventListener("click", ()=>{
    if (IS_MEDIA_VIEW) { setMediaMode(true); return; }
    const on = !document.body.classList.contains("mediaMode");
    setMediaMode(on);
    if (document.body.classList.contains("drawerOpen")) closeDrawer();
  });
}
// restore / initialize
try{
  if (IS_MEDIA_VIEW) {
    setMediaMode(true);
    if (mediaBtn) { mediaBtn.disabled = true; mediaBtn.classList.add('locked'); }
  } else {
    setMediaMode(sessionStorage.getItem("mediaModeOn")==="1");
  }
}catch(e){}

// Media view layout is driven by Media Mode (body.mediaMode) and does not force Scout Mode.
let __scrollLockCount = 0;
let __scrollLockY = 0;
function lockScroll(){
  __scrollLockCount += 1;
  if (__scrollLockCount !== 1) return;
  __scrollLockY = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add("scrollLocked");
  document.body.style.position = "fixed";
  document.body.style.top = `-${__scrollLockY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}
function unlockScroll(){
  __scrollLockCount = Math.max(0, __scrollLockCount - 1);
  if (__scrollLockCount !== 0) return;
  document.body.classList.remove("scrollLocked");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, __scrollLockY || 0);
}

function openModal(title, htmlContent){
  const ov = document.getElementById("modalOverlay");
  const t = document.getElementById("modalTitle");
  const c = document.getElementById("modalContent");
  if (!ov || !t || !c) return;

  // Ensure drawer isn't trapping focus/scroll when modal opens
  closeDrawer();

  t.textContent = title;
  c.innerHTML = htmlContent;
  ov.style.display = "flex";
  lockScroll();
}
function closeModal(){
  const ov = document.getElementById("modalOverlay");
  if (ov && ov.style.display !== "none"){
    ov.style.display = "none";
    unlockScroll();
  }
}





/* --- Responsive hamburger + drawer nav (FULL) --- */
function initResponsiveNav(){
  const mq = window.matchMedia("(max-width: 980px)");
  const drawer = document.getElementById("navDrawer");
  const overlay = document.getElementById("drawerOverlay");
  const menuBtn = document.getElementById("menuBtn");
  const closeBtn = document.getElementById("drawerCloseBtn");
  const drawerBody = document.getElementById("drawerBody");
  const controlsRight = document.querySelector(".controlsRight");
  const searchWrap = document.getElementById("searchWrap");

  if (!drawer || !overlay || !menuBtn || !closeBtn || !drawerBody) return;

  const moveEls = [
    document.getElementById("toggleScout"),
    document.getElementById("toggleCoach"),
    document.getElementById("toggleMedia"),
    document.getElementById("photosLabel"),
    document.getElementById("csvLabel"),
  ].filter(Boolean);

  const searchOriginalSpot = searchWrap ? { parent: searchWrap.parentNode, next: searchWrap.nextSibling } : null;

  const originalSpots = moveEls.map(el=>({
    el,
    parent: el.parentNode,
    next: el.nextSibling
  }));

  function moveToDrawer(){
    moveEls.forEach(el=> drawerBody.appendChild(el));
  }
  function restoreFromDrawer(){
    originalSpots.forEach(({el,parent,next})=>{
      if (!parent) return;
      if (next && next.parentNode === parent) parent.insertBefore(el, next);
      else parent.appendChild(el);
    });
  }

  function setMobileLayout(isMobile){
    if (isMobile){
      moveToDrawer();
      // Keep athlete search outside the drawer; place it next to Menu/Refresh on mobile
      if (searchWrap && controlsRight && !controlsRight.contains(searchWrap)){
        controlsRight.insertBefore(searchWrap, controlsRight.firstChild);
      }
      overlay.setAttribute("aria-hidden", document.body.classList.contains("drawerOpen") ? "false" : "true");
    } else {
      closeDrawer(true);
      restoreFromDrawer();
      // Restore search to its original position
      if (searchWrap && searchOriginalSpot && searchOriginalSpot.parent){
        const { parent, next } = searchOriginalSpot;
        if (next && next.parentNode === parent) parent.insertBefore(searchWrap, next);
        else parent.appendChild(searchWrap);
      }
    }
  }

  menuBtn.addEventListener("click", ()=>{
    closeModal();
    openDrawer();
  });
  closeBtn.addEventListener("click", ()=> closeDrawer());
  overlay.addEventListener("click", ()=> closeDrawer());
  document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeDrawer(); });

  if (mq.addEventListener) mq.addEventListener("change", (e)=> setMobileLayout(e.matches));
  else mq.addListener((e)=> setMobileLayout(e.matches));

  setMobileLayout(mq.matches);
}

function openDrawer(){
  const mq = window.matchMedia("(max-width: 980px)");
  if (!mq.matches) return;
  const overlay = document.getElementById("drawerOverlay");
  document.body.classList.add("drawerOpen");
  if (overlay) overlay.setAttribute("aria-hidden","false");
  lockScroll();
}
function closeDrawer(skipUnlock){
  const overlay = document.getElementById("drawerOverlay");
  if (!document.body.classList.contains("drawerOpen")) return;
  document.body.classList.remove("drawerOpen");
  if (overlay) overlay.setAttribute("aria-hidden","true");
  if (!skipUnlock) unlockScroll();
}

function initModalWiring(){
  const modalClose = document.getElementById("modalClose");
  const modalOverlay = document.getElementById("modalOverlay");
  const aboutBtn = document.getElementById("aboutBtn");
  const versionBtn = document.getElementById("versionBtn");

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalOverlay) modalOverlay.addEventListener("click", (e)=>{ if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeModal(); });

  if (aboutBtn){
    aboutBtn.addEventListener("click", ()=>{
      openModal("How to use this dashboard", `
        <div style="display:grid;gap:10px">
          <div><b>1) Load CSV:</b> Click <span class="mono">Choose CSV</span> and select your combine results CSV.</div>
          <div><b>2) Load photos:</b> Click <span class="mono">Load Photos</span> and select the folder containing athlete photos named by <span class="mono">Formulario#</span> (example: <span class="mono">75.jpg</span>).</div>
          <div><b>3) Browse athletes:</b> Use the left list to filter and select a player.</div>
          <div><b>4) Modes:</b>
            <ul style="margin:6px 0 0 18px">
              <li><b>Normal:</b> Full dashboard view + position suggestion controls.</li>
              <li><b>Scout Mode:</b> Scout Profile layout (contact-first).</li>
              <li><b>Coach Mode:</b> Scout Profile layout + keeps performance charts/sections below.</li>
            </ul>
          </div>
        
          <hr style="border:0;border-top:1px solid rgba(255,255,255,.12);margin:8px 0">
          <div style="font-weight:900;font-size:15px;margin-bottom:6px">What's in Pro Mode</div>
          <ul style="margin:0 0 8px 18px;line-height:1.55">
            <li><b>Percentiles + tier labels</b> for each combine metric.</li>
            <li><b>Athletic Score</b> + advanced sorting.</li>
            <li><b>Strengths & Flags</b> summaries.</li>
            <li><b>Watchlist + Notes</b> (save locally per athlete).</li>
            <li><b>Pro view</b> (Coach-style + Intelligence UI).</li>
          </ul>
          <button class="btn" id="upgradeProBtn" style="width:100%;font-weight:900">Upgrade to Pro</button>
</div>
      `);
      // Upgrade CTA (placeholder link)
      setTimeout(()=>{
        const b = document.getElementById("upgradeProBtn");
        if (b) b.onclick = ()=> window.open("?view=pro", "_blank");
      }, 0);
    });
  }

  if (versionBtn){
    versionBtn.addEventListener("click", ()=>{
      openModal("Version & Changelog", `<div style="display:grid;gap:10px">
  <div style="font-weight:900">What’s new</div>
  <div><b>v1.0.120</b> — Presenter Mode polish + best-results display (UI updates).</div>

  <div style="margin-top:10px;font-weight:900">Changelog</div>




<div style="margin-top:6px;font-weight:900">v1.0.122</div>
<ul style="margin:6px 0 0 18px">
  <li>Added Watchlist (★) and Notes (saved locally per athlete) for Admin + Pro workflows.</li>
  <li>Watchlist-only filter and star indicator in athlete list.</li>
</ul>

<div style="margin-top:6px;font-weight:900">v1.0.121</div>
<ul style="margin:6px 0 0 18px">
  <li>Added Intelligence UI (Admin + Pro only): percentiles, tiers, Athletic Score, sorting, Strengths &amp; Flags.</li>
  <li>New <span class="mono">?view=pro</span>: Coach-style view with intelligence enabled and Pro pill.</li>
  <li>Strengths &amp; Flags now display in two rows, with icons for quick scanning.</li>
  <li>Coach Mode header label switches to <span class="mono">Athlete Profile</span> (Scout Mode restores <span class="mono">Scout Profile</span>).</li>
  <li>Improved Sort dropdown readability (selected item stays white; list options are dark).</li>
</ul>

<div style="margin-top:6px;font-weight:900">v1.0.120</div>
<ul style="margin:6px 0 0 18px">
  <li>Presentation Mode improvements: synced athlete selection via <span class="mono">#sel=</span> and stable CDN photos.</li>
  <li>Presenter shows best attempts only: 40yds, Broad Jump, 5-10-5, 3-Cone, Bench (with units and 2-decimal time formatting).</li>
  <li>Spanish CSV field support in presenter: <span class="mono">Edad</span>, <span class="mono">Estatura</span>, <span class="mono">Peso</span>, <span class="mono">Lugar de Estudios</span>.</li>
  <li>Presenter placeholders: missing tests still render as <span class="mono">—</span>; initials fallback enlarged for readability.</li>
</ul>


<div style="margin-top:6px;font-weight:900">v1.0.118</div>
<ul style="margin:6px 0 0 18px">
  <li>Added <span class="mono">?view=public</span> mode for sharing a simplified UI externally.</li>
  <li>Public View hides: Load Photos, Load CSV, GitHub, and Changelog buttons.</li>
  <li>Public View keeps <b>Scout Mode</b> and <b>Coach Mode</b> toggles available.</li>
  <li>Header controls aligned under the title; improved spacing so Search/Refresh/About are not pushed up on mobile.</li>
  <li>Added a subtle <b>Public</b> pill indicator when Public View is active.</li>
</ul>

<div style="margin-top:6px;font-weight:900">v1.0.118</div>
<ul style="margin:6px 0 0 18px">
  <li>Added responsive hamburger drawer nav (overlay header, tap-to-close, click-safe buttons).</li>
  <li>Mobile modals improved: max-size, internal scroll, iOS-safe scrolling, background scroll lock.</li>
  <li>Kept Athlete Search visible outside drawer next to Menu + Refresh on mobile.</li>
  <li>Optimized Athlete List on mobile to show only photo + name (compact rows).</li>
  <li>Improved small-phone (≈375px) Athlete Profile responsiveness; fixed photo box clipping.</li>
  <li>Improved Position dropdown option readability.</li>
  <li>Scout/Coach contact details: added <span class="mono">lbs</span> unit for weight.</li>
  <li>Updated guidance text to draft-day coaching suggestions.</li>
</ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>Added complete version history (v1.0.118 → v1.0.118) inside the Changelog modal.</li>
    <li>Kept About/Changelog modal behavior identical to the stable build.</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>Locked header height to 128px (prevents layout jumps).</li>
    <li>Improved toolbar spacing (no overlap with content).</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>Refresh control switched to link-style to match About/Changelog group.</li>
    <li>Initial header height lock introduced (later refined in v1.0.118).</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>controlsSpacer min-width set to 0px.</li>
    <li>“Load Photos Folder” renamed to “Load Photos”.</li>
    <li>GitHub link updated to repository URL.</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>Header right-side control order finalized: Refresh | GitHub | About | Changelog.</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>Navigation layout fixes (single-row header).</li>
    <li>GitHub button added to header controls.</li>
    <li>controlsSpacer tuned for better alignment.</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v1.0.118</div>
  <ul style="margin:6px 0 0 18px">
    <li>Merged stable modal system from v8.1j-alpha with updated header link-style controls.</li>
    <li>Standardized small SVG icon sizing for header controls.</li>
  </ul>

  <div style="margin-top:6px;font-weight:900">v8.1j-alpha</div>
  <ul style="margin:6px 0 0 18px">
    <li>Baseline build with smooth working About/Changelog modals.</li>
    <li>Left list initials fallback for missing photos.</li>
  </ul>
</div>`);
    });
  }
}
document.addEventListener("DOMContentLoaded", initModalWiring);


// Search clear (X) button
const searchEl = document.getElementById("search");
const clearBtn = document.getElementById("clearSearch");
function toggleClearSearch(){
  if (!searchEl || !clearBtn) return;
  clearBtn.style.display = searchEl.value && searchEl.value.trim().length ? "inline-flex" : "none";
}
if (searchEl){
  searchEl.addEventListener("input", toggleClearSearch);
  // also show/hide on page load
  setTimeout(toggleClearSearch, 0);
}
if (clearBtn && searchEl){
  clearBtn.addEventListener("click", ()=>{
    searchEl.value = "";
    toggleClearSearch();
    // trigger existing filter logic
    searchEl.dispatchEvent(new Event("input", { bubbles:true }));
    searchEl.focus();
  });

// Sort dropdown (v1.0.121)
const sortEl = document.getElementById("sortSelect");
if (sortEl){
  sortEl.value = SORT_KEY;
  sortEl.addEventListener("change", ()=>{
    SORT_KEY = String(sortEl.value || "name");
    applyFilter();
  });
}
}


function applyAvatarFallback(){
  // Replace broken avatar <img> with a subtle placeholder (no broken image icon)
  document.querySelectorAll("img.avatarImg").forEach(img=>{
    if (img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = "1";
    img.addEventListener("error", ()=>{
      const ph=document.createElement("div"); ph.className="avatarInitials"; ph.textContent=img.dataset.initials||"—"; img.replaceWith(ph);
    });
  });
}

// Public view mode (?view=public): simplified UI + default Coach Mode
function applyPublicViewMode(){
  // Force Coach Mode on, Scout Mode off (do not rely on session storage)
  try{ setScoutMode(false); }catch(e){}
  try{ setCoachMode(true); }catch(e){}

  // Hide controls not meant for public users
  // Keep mode toggles visible even in public view (requested for coaches/scouts)
  const hideIds = ["photosLabel","csvLabel","githubBtn","versionBtn"];
  hideIds.forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}
if (IS_PUBLIC_VIEW){
  applyPublicViewMode();
}


initResponsiveNav();

setStatus("Ready");

/* GitHub button: moved from inline onclick -> JS binding */
try{
  const gb = document.getElementById("githubBtn");
  if (gb && !gb._bound){
    gb._bound = true;
    gb.addEventListener("click", ()=>{
      window.open("https://github.com/Eddy0412/athlete-dashboard", "_blank");
    });
  }
}catch(e){}

  // ---- Public API (debug + safe external hooks) ----
  ACD.selectAthlete = selectAthlete;
  ACD.formatHeightFeetInches = formatHeightFeetInches;
  ACD.applyFilter = applyFilter;
  ACD.loadDefaultCsv = loadDefaultCsv;

  ACD.loadedAt = new Date().toISOString();
  console.log("[ACD] loaded", ACD.version, ACD.loadedAt);

})();
