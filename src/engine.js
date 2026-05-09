// =============================================
// ADVANCED INTRADAY SCANNER ENGINE
// Optimized for NSE Momentum + Pullback + Shorts
// =============================================

import axios from "axios";

// =============================================
// CONFIG
// =============================================

const CONFIG = {

  MIN_PRICE: 30,
  MAX_PRICE: 5000,

  REQUEST_DELAY: 120,

  MAX_PARALLEL: 4,

  VOLUME_CAP: 5,

  MOMENTUM_THRESHOLD: 1,

  SHORT_THRESHOLD: -0.3,

  API_TIMEOUT: 10000
};

// =============================================
// AXIOS INSTANCE
// =============================================

const api = axios.create({

  timeout: CONFIG.API_TIMEOUT,

  headers: {

    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",

    "Accept":
      "application/json,text/plain,*/*",

    "Accept-Language":
      "en-US,en;q=0.9",

    "Connection":
      "keep-alive"
  }
});

// =============================================
// MARKET TIME
// =============================================

function isMarketOpenIST() {

  const now = new Date(
    new Date().toLocaleString(
      "en-US",
      { timeZone: "Asia/Kolkata" }
    )
  );

  const mins =
    now.getHours() * 60 +
    now.getMinutes();

  return (
    mins >= (9 * 60 + 15) &&
    mins <= (15 * 60 + 30)
  );
}

// =============================================
// SLEEP
// =============================================

function sleep(ms) {

  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

// =============================================
// FETCH 5M CANDLES
// =============================================

async function get5MinCandles(
  symbol,
  retry = 2
) {

  try {

    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`;

    const res = await api.get(url);

    const result =
      res?.data?.chart?.result?.[0];

    if (!result) {

      console.log(
        "No chart result:",
        symbol
      );

      return [];
    }

    const timestamps =
      result.timestamp || [];

    const quotes =
      result.indicators?.quote?.[0];

    if (!quotes) {

      console.log(
        "No quote candles:",
        symbol
      );

      return [];
    }

    const candles = timestamps.map(
      (t, i) => ({

        time: t,

        open: quotes.open?.[i],

        high: quotes.high?.[i],

        low: quotes.low?.[i],

        close: quotes.close?.[i],

        volume: quotes.volume?.[i] || 0
      })
    )
    .filter(c =>

      c.open != null &&
      c.high != null &&
      c.low != null &&
      c.close != null
    );

    return candles;

  } catch (e) {

    if (retry > 0) {

      await sleep(10000);

      return get5MinCandles(
        symbol,
        retry - 1
      );
    }

    console.log(
      "Candle fetch error:",
      symbol,
      e
    );

    return [];
  }
}

// =============================================
// REAL VWAP
// =============================================

function calculateVWAP(candles) {

  let cumulativePV = 0;
  let cumulativeVol = 0;

  for (const c of candles) {

    const typicalPrice =
      (c.high + c.low + c.close) / 3;

    cumulativePV +=
      typicalPrice * c.volume;

    cumulativeVol += c.volume;
  }

  if (!cumulativeVol) {

    return null;
  }

  return cumulativePV / cumulativeVol;
}

// =============================================
// RELATIVE STRENGTH
// =============================================

function calculateStrength(
  momentum,
  moveFromOpen,
  volRatio
) {

  const cappedVolume =
    Math.min(
      volRatio,
      CONFIG.VOLUME_CAP
    );

  return (

    momentum * 30 +

    moveFromOpen * 35 +

    cappedVolume * 35
  );
}

// =============================================
// ANALYZE STOCK
// =============================================

async function analyzeStock(q) {

  try {

    const price =
      q.regularMarketPrice || 0;

    const prevClose =
      q.regularMarketPreviousClose || 0;

    const open =
      q.regularMarketOpen || 0;

    const volume =
      q.regularMarketVolume || 0;

    const avgVolume =
      q.averageDailyVolume3Month || 1;

    // =========================================
    // BASIC FILTER
    // =========================================

    if (
      price < CONFIG.MIN_PRICE ||
      price > CONFIG.MAX_PRICE
    ) {

      return null;
    }

    // =========================================
    // CALCULATIONS
    // =========================================

    const momentum =
      ((price - prevClose) /
      prevClose) * 100;

    const gap =
      ((open - prevClose) /
      prevClose) * 100;

    const moveFromOpen =
      ((price - open) /
      open) * 100;

    const volRatio =
      volume / avgVolume;

    const dayHigh =
      q.regularMarketDayHigh || price;

    const dayLow =
      q.regularMarketDayLow || price;

    const distanceFromHigh =
      ((dayHigh - price) /
      dayHigh) * 100;

    // =========================================
    // EARLY REJECTION
    // =========================================

    const possibleLong =
      momentum > 0.5 &&
      volRatio > 0.8;

    const possibleShort =
      momentum < -0.2 &&
      volRatio > 0.8;

    if (
      !possibleLong &&
      !possibleShort
    ) {

      return null;
    }

    // =========================================
    // FETCH CANDLES
    // =========================================

    let candles = [];

    if (isMarketOpenIST()) {

      candles =
        await get5MinCandles(
          q.symbol
        );

      await sleep(
        CONFIG.REQUEST_DELAY
      );
    }

    // =========================================
    // FALLBACK
    // =========================================

    if (!candles.length) {

      return {

        symbol: q.symbol,

        price,

        momentum,

        gap,

        moveFromOpen,

        volRatio,

        distanceFromHigh,

        vwap: null,

        belowVWAP: false,

        breakout: false,

        breakdown: false,

        score:
          calculateStrength(
            momentum,
            moveFromOpen,
            volRatio
          )
      };
    }

    // =========================================
    // PREVIOUS CANDLE
    // =========================================

    const prevCandle =
      candles[candles.length - 2];

    const latestCandle =
      candles[candles.length - 1];

    const prevHigh =
      prevCandle?.high || dayHigh;

    const prevLow =
      prevCandle?.low || dayLow;

    // =========================================
    // REAL VWAP
    // =========================================

    const vwap =
      calculateVWAP(candles);

    const belowVWAP =
      vwap ? price < vwap : false;

    // =========================================
    // BREAKOUT / BREAKDOWN
    // =========================================

    const breakout =
      latestCandle.close >
      prevHigh;

    const breakdown =
      latestCandle.close <
      prevLow;

    // =========================================
    // SCORING
    // =========================================

    const score =
      calculateStrength(
        momentum,
        moveFromOpen,
        volRatio
      );

    return {

      symbol: q.symbol,

      price,

      momentum,

      gap,

      moveFromOpen,

      volRatio,

      distanceFromHigh,

      vwap,

      belowVWAP,

      breakout,

      breakdown,

      prevHigh,

      prevLow,

      score
    };

  } catch (e) {

    console.log(
      "Analyze error:",
      q.symbol,
      e.message
    );

    return null;
  }
}

// =============================================
// CLASSIFY LONGS
// =============================================

function isStrongLong(s) {

  const strongMomentum =
    s.momentum > 1;

  const strongVolume =
    s.volRatio > 1.2;

  const controlledMove =
    s.moveFromOpen > 0.5 &&
    s.moveFromOpen < 3.5;

  const pullback =
    s.distanceFromHigh > 0.3;

  const aboveVWAP =
    !s.belowVWAP;

  return (

    strongMomentum &&
    strongVolume &&
    controlledMove &&
    pullback &&
    aboveVWAP
  );
}

// =============================================
// CLASSIFY SHORTS
// =============================================

function getShortTag(s) {

  // =========================================
  // FAILED GAP
  // =========================================

  if (

    s.gap > 1 &&
    s.moveFromOpen < -0.5 &&
    s.volRatio > 1.2
  ) {

    return "FAILED_GAP";
  }

  // =========================================
  // VWAP BREAK
  // =========================================

  if (

    s.belowVWAP &&
    s.momentum < -0.5 &&
    s.breakdown
  ) {

    return "VWAP_BREAKDOWN";
  }

  // =========================================
  // WEAK TREND
  // =========================================

  if (

    s.momentum < -0.5 &&
    s.moveFromOpen < -0.3 &&
    s.volRatio > 1
  ) {

    return "WEAK_TREND";
  }

  return null;
}

// =============================================
// MAIN ENGINE
// =============================================

export async function runScannerEngine(
  quotes
) {

  console.log(
    "================================="
  );

  console.log(
    "SCANNER STARTED"
  );

  console.log(
    "================================="
  );

  const analyzed = [];

  // =========================================
  // CONTROLLED PROCESSING
  // =========================================

  for (const q of quotes) {

    const stock =
      await analyzeStock(q);

    if (stock) {

      analyzed.push(stock);
    }
  }

  // =========================================
  // RESULT OBJECT
  // =========================================

  const result = {

    top: [],

    shortCandidates: []
  };

  // =========================================
  // CLASSIFICATION
  // =========================================

  for (const s of analyzed) {

    // =========================================
    // LONGS
    // =========================================

    if (isStrongLong(s)) {

      result.top.push({

        ...s,

        setup:
          "MOMENTUM_PULLBACK"
      });
    }

    // =========================================
    // SHORTS
    // =========================================

    const shortTag =
      getShortTag(s);

    if (shortTag) {

      result.shortCandidates.push({

        ...s,

        tag: shortTag
      });
    }
  }

  // =========================================
  // SORTING
  // =========================================

  result.top.sort(
    (a, b) => b.score - a.score
  );

  result.shortCandidates.sort(
    (a, b) =>
      a.score - b.score
  );

  // =========================================
  // REMOVE DUPLICATES
  // =========================================

  result.shortCandidates =
    result.shortCandidates.filter(
      (v, i, arr) =>

        i ===
        arr.findIndex(
          t => t.symbol === v.symbol
        )
    );

  // =========================================
  // LIMITS
  // =========================================

  result.top =
    result.top.slice(0, 10);

  result.shortCandidates =
    result.shortCandidates.slice(
      0,
      10
    );

  // =========================================
  // FINAL LOGS
  // =========================================

  console.log(
    "LONG CANDIDATES:",
    result.top.length
  );

  console.log(
    "SHORT CANDIDATES:",
    result.shortCandidates.length
  );

  console.log(
    "================================="
  );

  return result;
}