// scannerEngine.js

import axios from "axios";

// ======================================
// MARKET TIME (IST)
// ======================================
function isMarketOpenIST() {

  const now = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata"
    })
  );

  const mins = now.getHours() * 60 + now.getMinutes();

  return (
    mins >= (9 * 60 + 15) &&
    mins <= (15 * 60 + 30)
  );
}

// ======================================
// FETCH 5M CANDLES
// ======================================
async function get5MinCandles(symbol) {

  try {

    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`;

    const res = await axios.get(url, {
      timeout: 5000
    });

    const result =
      res?.data?.chart?.result?.[0];

    if (!result) return [];

    const timestamps =
      result.timestamp || [];

    const quotes =
      result.indicators?.quote?.[0];

    if (!quotes) return [];

    const candles =
      timestamps.map((t, i) => ({
        time: t,
        open: quotes.open?.[i],
        high: quotes.high?.[i],
        low: quotes.low?.[i],
        close: quotes.close?.[i],
        volume: quotes.volume?.[i]
      }))
      .filter(c =>
        c.high != null &&
        c.low != null &&
        c.close != null
      );

    return candles;

  } catch (e) {

    console.log("Candle fetch failed:", symbol);

    return [];
  }
}

// ======================================
// ANALYZE STOCK
// ======================================
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
  ) {
    return null;
  }

  // ======================================
  // CALCULATIONS
  // ======================================

  const momentum =
    ((price - prev) / prev) * 100;

  const gap =
    ((open - prev) / prev) * 100;

  const vol_ratio =
    volume / avgVolume;

  const moveFromOpen =
    ((price - open) / open) * 100;

  const dayHigh =
    q.regularMarketDayHigh || price;

  const dayLow =
    q.regularMarketDayLow || price;

  const distanceFromHigh =
    ((dayHigh - price) / dayHigh) * 100;

  const distanceFromLow =
    ((price - dayLow) / dayLow) * 100;

  const vwap =
    (dayHigh + dayLow + price) / 3;

  const aboveVWAP =
    price > vwap;

  const belowVWAP =
    price < vwap;

  // ======================================
  // FETCH CANDLES
  // ======================================

  let prevHigh = dayHigh;
  let prevLow = dayLow;

  let lastCandle = null;

  //if (isMarketOpenIST()) {

    const candles =
      await get5MinCandles(q.symbol);

    if (
      Array.isArray(candles) &&
      candles.length >= 2
    ) {

      const prevCandle =
        candles[candles.length - 2];

      lastCandle =
        candles[candles.length - 1];

      prevHigh =
        prevCandle?.high || dayHigh;

      prevLow =
        prevCandle?.low || dayLow;
    }
 // }

  // ======================================
  // SELL PRESSURE
  // ======================================

  const momentumAcceleration =
    moveFromOpen < momentum;

  const score =
      momentum * 25 +
      moveFromOpen * 35 +
      vol_ratio * 40;

  const shortScore =
      (-momentum) * 30 +
      (-moveFromOpen) * 40 +
      vol_ratio * 30;

  return {

    symbol: q.symbol,

    price,

    momentum,
    gap,
    vol_ratio,
    moveFromOpen,

    dayHigh,
    dayLow,

    distanceFromHigh,
    distanceFromLow,

    vwap,
    aboveVWAP,
    belowVWAP,

    momentumAcceleration,

    prevHigh,
    prevLow,

    lastCandle,

    score,
    shortScore
  };
}

// ======================================
// MAIN ENGINE
// ======================================
export async function runScannerEnginePolling(quotes) {

  const analyzed =
    await Promise.all(
      quotes.map(q => analyzeStock(q))
    );

  const stocks =
    analyzed.filter(Boolean);

  const result = {
    top: [],
    shortCandidates: [],
    marketMovers: []
  };

  // ======================================
  // CLASSIFY
  // ======================================

  for (const s of stocks) {

    if (!s) continue;

    if (s.vol_ratio < 0.25)
      continue;

    // ======================================
    // 🚀 BUY ENGINE
    // ======================================

    const strongTrend =
      s.momentum > 1 &&
      s.vol_ratio > 1.2;

    const pullbackZone =
      s.moveFromOpen > 0.6 &&
      s.moveFromOpen < 2;

    const notAtTop =
      s.distanceFromHigh > 0.4;

    const healthyTrend =
      s.distanceFromHigh < 1.5;

    const breakoutConfirmed =
      s.prevHigh &&
      s.price >
      s.prevHigh * 1.001;

    let signal = "WAIT ⏳";

    if (
      strongTrend &&
      pullbackZone &&
      notAtTop &&
      healthyTrend
    ) {

      signal =
        breakoutConfirmed
          ? "TRIGGER 🟢"
          : "ENTER 🟢";

      result.top.push({
        ...s,
        signal
      });
    }

    // ======================================
    // 📉 MARKET MOVERS
    // ======================================

    if (
      Math.abs(s.momentum) > 3 &&
      s.vol_ratio > 1
    ) {

      result.marketMovers.push(s);
    }

    // ======================================
    // 🔴 ADVANCED SHORT ENGINE
    // ======================================

    const weakMomentum =
      s.momentum < -0.2;

    const increasingSellPressure =
      s.moveFromOpen < 0;

    const highRelativeVolume =
      s.vol_ratio > 1.5;

    const weakTrendStructure =
      s.distanceFromHigh > 1;

    const notOversold =
      s.momentum > -5;

    const vwapRejection =
      s.belowVWAP &&
      s.price < s.vwap;

    const lowerHighWeakness =
      s.moveFromOpen < 0.5 &&
      s.distanceFromHigh > 0.8;

    const notSideways =
      Math.abs(s.moveFromOpen) > 0.3;

    const notCrashed =
      s.distanceFromLow > 0.5;

    // ======================================
    // EARLY SHORT
    // ======================================

    if (
      weakMomentum &&
      increasingSellPressure &&
      vwapRejection &&
      highRelativeVolume &&
      weakTrendStructure &&
      lowerHighWeakness &&
      notOversold &&
      notSideways &&
      notCrashed
    ) {

      result.shortCandidates.push({
        ...s,
        signal: "EARLY SHORT 🔴",
        strength: 1
      });
    }

    // ======================================
    // TRIGGER SHORT
    // ======================================

    const breakdownStarting =
      s.prevLow &&
      s.price <
      s.prevLow * 0.999;

    if (
      breakdownStarting &&
      vwapRejection &&
      highRelativeVolume &&
      weakTrendStructure &&
      momentumAcceleration &&
      notOversold &&
      notCrashed
    ) {

      result.shortCandidates.push({
        ...s,
        signal: "TRIGGER SHORT 🔴",
        strength: 2
      });
    }

    // ======================================
    // STRONG SHORT
    // ======================================

    const strongSelloff =
      s.momentum < -1.5 &&
      s.moveFromOpen < -1 &&
      s.vol_ratio > 2;

    if (
      strongSelloff &&
      breakdownStarting &&
      vwapRejection &&
      momentumAcceleration &&
      notOversold
    ) {

      result.shortCandidates.push({
        ...s,
        signal: "STRONG SHORT 🔥",
        strength: 3
      });
    }

  }

  // ======================================
  // SORTING
  // ======================================

  result.top.sort(
    (a, b) =>
      b.score - a.score
  );

  result.shortCandidates.sort(
    (a, b) =>
      b.strength - a.strength ||
      b.shortScore - a.shortScore
  );

  result.marketMovers.sort(
    (a, b) =>
      Math.abs(b.momentum) -
      Math.abs(a.momentum)
  );

  // ======================================
  // REMOVE DUPLICATES
  // ======================================

  result.shortCandidates =
    result.shortCandidates.filter(
      (v, i, arr) =>
        i === arr.findIndex(
          t => t.symbol === v.symbol
        )
    );

  // ======================================
  // LIMITS
  // ======================================

  result.top =
    result.top.slice(0, 10);

  result.shortCandidates =
    result.shortCandidates.slice(0, 10);

  result.marketMovers =
    result.marketMovers.slice(0, 10);

  return result;
}