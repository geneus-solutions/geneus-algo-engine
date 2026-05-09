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

// ======================================
// ANALYZE STOCK
// ======================================
async function analyzeStock(q) {
  const price = q.regularMarketPrice || 0;
  const prev = q.regularMarketPreviousClose || 0;
  const open = q.regularMarketOpen || 0;
  const volume = q.regularMarketVolume || 0;
  const avgVolume = q.averageDailyVolume3Month || 1;

  if (price < 30 || price > 5000) return null;

  // 1. Core Metrics
  const momentum = ((price - prev) / prev) * 100;
  const gap = ((open - prev) / prev) * 100;
  const vol_ratio = volume / avgVolume;
  const moveFromOpen = ((price - open) / open) * 100;

  // 2. Candle Analysis (Precise VWAP & Prev High/Low)
  let vwap = (q.regularMarketDayHigh + q.regularMarketDayLow + price) / 3; // Fallback
  let prevHigh = q.regularMarketDayHigh;
  let prevLow = q.regularMarketDayLow;

  //if (isMarketOpenIST()) {
    const candles = await get5MinCandles(q.symbol);
    
    if (candles.length >= 2) {
      // Calculate true Volume Weighted Average Price
      let totalVpv = 0;
      let totalVol = 0;
      candles.forEach(c => {
        const avg = (c.high + c.low + c.close) / 3;
        totalVpv += (avg * c.vol);
        totalVol += c.vol;
      });
      
      if (totalVol > 0) vwap = totalVpv / totalVol;

      const pCandle = candles[candles.length - 2];
      prevHigh = pCandle.high;
      prevLow = pCandle.low;
    }
  //}

  return {
    symbol: q.symbol,
    price,
    momentum,
    gap,
    vol_ratio,
    moveFromOpen,
    vwap,
    belowVWAP: price < vwap,
    score: (momentum * 25) + (moveFromOpen * 35) + (vol_ratio * 40),
    shortScore: (-momentum * 30) + (-moveFromOpen * 40) + (vol_ratio * 30),
    distanceFromHigh: ((q.regularMarketDayHigh - price) / q.regularMarketDayHigh) * 100,
    prevHigh,
    prevLow
  };
}

// ======================================
// MAIN ENGINE
// ======================================
export async function runScannerEngine3(quotes) {
  const results = { top: [], shortCandidates: [] };
  
  // Process in chunks of 5 to avoid Yahoo rate limits
  const analyzed = [];
  for (let i = 0; i < quotes.length; i += 5) {
    const chunk = quotes.slice(i, i + 5);
    const resolved = await Promise.all(chunk.map(q => analyzeStock(q)));
    analyzed.push(...resolved);
    if (i + 5 < quotes.length) await sleep(300); // 300ms breather
  }

  const stocks = analyzed.filter(Boolean);

  for (const s of stocks) {
    // Bullish: Strong trend, but cooling off (pullback)
    if (s.momentum > 1 && s.vol_ratio > 1.2 && s.moveFromOpen > 0.6 && s.moveFromOpen < 2.2 && s.distanceFromHigh > 0.4) {
      results.top.push(s);
    }

    // Bearish: Multiple triggers
    const isEarlyWeak = s.momentum < -0.3 && s.moveFromOpen < -0.2 && s.vol_ratio > 1.1;
    const isFailedGap = s.gap > 0.8 && s.moveFromOpen < -0.2 && s.vol_ratio > 1.2;
    const isVWAPBreak = s.belowVWAP && s.momentum < -0.3 && s.vol_ratio > 1.1;

    if (isEarlyWeak || isFailedGap || isVWAPBreak) {
      let tag = isVWAPBreak ? "VWAP_BREAK" : (isFailedGap ? "FAILED_GAP" : "EARLY_WEAK");
      results.shortCandidates.push({ ...s, tag });
    }
  }               

  // Sort & Limit
  results.top.sort((a, b) => b.score - a.score);
  results.shortCandidates.sort((a, b) => b.shortScore - a.shortScore);

  return {
    top: results.top.slice(0, 10),
    shortCandidates: results.shortCandidates.slice(0, 10)
  };
}