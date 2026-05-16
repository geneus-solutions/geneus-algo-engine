import axios from "axios";

// ======================================
// UTILS: Delay to prevent API blocking
// ======================================
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function isMarketOpenIST() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const mins = now.getHours() * 60 + now.getMinutes();
  // 9:15 AM to 3:30 PM
  return mins >= 555 && mins <= 930;
}

// ======================================
// FETCH 5M CANDLES (WITH HEADERS)
// ======================================
async function get5MinCandles(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`;
    
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    const result = res?.data?.chart?.result?.[0];
    if (!result || !result.timestamp) return [];

    const quotes = result.indicators?.quote?.[0];
    const volume = quotes.volume || [];

    return result.timestamp.map((t, i) => ({
      time: t,
      open: quotes.open?.[i],
      high: quotes.high?.[i],
      low: quotes.low?.[i],
      close: quotes.close?.[i],
      vol: volume[i] || 0
    })).filter(c => c.close != null);

  } catch (e) {
    console.error(`Fetch error [${symbol}]:`, e.response?.status || e.message);
    return [];
  }
}

async function analyzeStock(q) {

  const price =
    q.regularMarketPrice || 0;

  const prev =
    q.regularMarketPreviousClose || 0;

  const open =
    q.regularMarketOpen || 0;

  const volume =
    q.regularMarketVolume || 0;

  const avgVolume =
    q.averageDailyVolume3Month || 1;

  if (
    price < 30 ||
    price > 5000
  ) return null;

  // =========================
  // CORE METRICS
  // =========================

  const momentum =
    ((price - prev) / prev) * 100;

  const gap =
    ((open - prev) / prev) * 100;

  const vol_ratio =
    volume / avgVolume;

  const moveFromOpen =
    ((price - open) / open) * 100;

  // =========================
  // DEFAULTS
  // =========================

  let vwap =
    (
      q.regularMarketDayHigh +
      q.regularMarketDayLow +
      price
    ) / 3;

  let prevHigh =
    q.regularMarketDayHigh;

  let prevLow =
    q.regularMarketDayLow;

  let lowerHigh = false;
  let lowerLow = false;

  // =========================
  // LIVE 5-MIN ANALYSIS
  // =========================

  const candles =
    await get5MinCandles(q.symbol);

  if (candles.length >= 4) {

    // -------------------------
    // Ignore first candle
    // -------------------------

    const usableCandles =
      candles.slice(1);

    // -------------------------
    // TRUE VWAP
    // -------------------------

    let totalVpv = 0;
    let totalVol = 0;

    usableCandles.forEach(c => {

      const avg =
        (c.high + c.low + c.close) / 3;

      totalVpv +=
        avg * c.vol;

      totalVol += c.vol;

    });

    if (totalVol > 0) {
      vwap = totalVpv / totalVol;
    }

    // -------------------------
    // Completed candles only
    // -------------------------

    const last =
      candles[candles.length - 2];

    const prevCandle =
      candles[candles.length - 3];

    prevHigh = last.high;
    prevLow = last.low;

    // -------------------------
    // Structure
    // -------------------------

    lowerHigh =
      last.high < prevCandle.high;

    lowerLow =
      last.low < prevCandle.low;

  }

  // =========================
  // BOUNCE DETECTION
  // =========================

  const bounceFromLow =
    (
      (price - q.regularMarketDayLow)
      / q.regularMarketDayLow
    ) * 100;

  // =========================
  // FINAL
  // =========================

  return {

    symbol: q.symbol,

    price,

    momentum,

    gap,

    vol_ratio,

    moveFromOpen,

    vwap,

    belowVWAP:
      price < vwap,

    score:
      (momentum * 25) +
      (moveFromOpen * 35) +
      (vol_ratio * 40),

    shortScore:
      (-momentum * 30) +
      (-moveFromOpen * 40) +
      (vol_ratio * 30),

    distanceFromHigh:
      (
        (q.regularMarketDayHigh - price)
        / q.regularMarketDayHigh
      ) * 100,

    bounceFromLow,

    lowerHigh,

    lowerLow,

    prevHigh,

    prevLow

  };

}
// ======================================
// MAIN ENGINE
// ======================================
export async function runScannerEngine3(quotes) {

  const results = {
    top: [],
    shortCandidates: []
  };

  // ====================================
  // PROCESS IN CHUNKS
  // ====================================

  const analyzed = [];

  for (let i = 0; i < quotes.length; i += 5) {

    const chunk =
      quotes.slice(i, i + 5);

    const resolved =
      await Promise.all(
        chunk.map(q => analyzeStock(q))
      );

    analyzed.push(...resolved);

    if (i + 5 < quotes.length) {
      await sleep(300);
    }

  }

  const stocks =
    analyzed.filter(Boolean);

  // ====================================
  // MARKET BREADTH FILTER
  // ====================================

  const marketWeakness =
    stocks.filter(
      s => s.momentum < 0
    ).length / stocks.length;

  const marketIsWeak =
    marketWeakness > 0.58;

  // ====================================
  // MAIN LOOP
  // ====================================

  for (const s of stocks) {

    // ====================================
    // BUY ENGINE
    // ====================================

    const bullishTrend =
      s.momentum > 1;

    const bullishVolume =
      s.vol_ratio > 1.3;

    const bullishOpen =
      s.moveFromOpen > 0.5 &&
      s.moveFromOpen < 2.5;

    const bullishVWAP =
      s.price > s.vwap;

    const bullishPullback =
      s.distanceFromHigh > 0.35;

    if (
      bullishTrend &&
      bullishVolume &&
      bullishOpen &&
      bullishVWAP &&
      bullishPullback
    ) {

      results.top.push({
        ...s,
        tag: "PULLBACK_BREAKOUT"
      });

    }

    // ====================================
    // SHORT ENGINE
    // ====================================

    // -------------------------------
    // Weakness
    // -------------------------------

    const weakTrend =
      s.momentum < -0.4;

    const weakOpen =
      s.moveFromOpen < -0.3;

    const weakVolume =
      s.vol_ratio > 1.4;

    const belowVWAP =
      s.price < s.vwap;

    // -------------------------------
    // Breakdown
    // -------------------------------

    const realBreakdown =
      s.prevLow &&
      s.price <
      s.prevLow * 0.999;

    // -------------------------------
    // Institutional Selling
    // -------------------------------

    const sellAcceleration =
      s.moveFromOpen <
      s.momentum;

    // -------------------------------
    // Avoid already crashed stocks
    // -------------------------------

    const notOversold =
      s.momentum > -5;

    // -------------------------------
    // Avoid bounce reversals
    // -------------------------------

    const notNearDayLow =
      s.distanceFromHigh > 1;

    // -------------------------------
    // Strong rebound detection
    // -------------------------------

    const strongRecovery =
      s.moveFromOpen >
      s.momentum;

    // -------------------------------
    // Short invalidation
    // -------------------------------

    const shortInvalidated =
      s.price > s.vwap ||
      strongRecovery;

    // -------------------------------
    // Failed Gap-up
    // -------------------------------

    const failedGap =
      s.gap > 1 &&
      s.moveFromOpen < -0.4;

    // -------------------------------
    // Final SHORT logic
    // -------------------------------

    const earlyShort =
      weakTrend &&
      weakOpen &&
      weakVolume &&
      belowVWAP &&
      notOversold &&
      !shortInvalidated;

    const triggerShort =
      weakTrend &&
      weakOpen &&
      weakVolume &&
      belowVWAP &&
      realBreakdown &&
      sellAcceleration &&
      marketIsWeak &&
      notOversold &&
      notNearDayLow &&
      !shortInvalidated;

    const strongShort =
      triggerShort &&
      s.vol_ratio > 2.2 &&
      s.momentum < -1.8;

    // ====================================
    // PUSH
    // ====================================

    if (strongShort) {

      results.shortCandidates.push({
        ...s,
        tag: "STRONG_SHORT"
      });

    }

    else if (triggerShort) {

      results.shortCandidates.push({
        ...s,
        tag: "TRIGGER_SHORT"
      });

    }

    else if (
      earlyShort ||
      failedGap
    ) {

      results.shortCandidates.push({
        ...s,
        tag: "EARLY_SHORT"
      });

    }

  }

  // ====================================
  // SORTING
  // ====================================

  results.top.sort(
    (a, b) => b.score - a.score
  );

  results.shortCandidates.sort(
    (a, b) => b.shortScore - a.shortScore
  );

  // ====================================
  // FINAL
  // ====================================
 // =========================================
  // FINAL LOGS
  // =========================================
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  console.log(
    "============ENGINE3===================== ",timestamp
  );

  console.log(
    "BUY CANDIDATES ENGINE3:",
   results.top.map(s => s.symbol)
  );

  console.log(
    "SHORT CANDIDATES ENGINE3:",
      results.shortCandidates.map(s => s.symbol)
  );

  console.log(
    "==========ENGINE3 end======================="
  );

  return {

    top:
      results.top.slice(0, 10),

    shortCandidates:
      results.shortCandidates.slice(0, 10)

  };

}