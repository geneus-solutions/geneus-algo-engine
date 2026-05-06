import axios from "axios";

// ===============================
// FETCH 5 MIN CANDLES (YAHOO)
// ===============================
async function get5MinCandles(symbol){

  try{
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`

    const res = await axios.get(url)

    const result = res.data.chart.result[0]

    const timestamps = result.timestamp
    const quotes = result.indicators.quote[0]

    const candles = timestamps.map((t,i)=>({
      time: t,
      open: quotes.open[i],
      high: quotes.high[i],
      low: quotes.low[i],
      close: quotes.close[i]
    })).filter(c=>c.high && c.low)

    return candles

  }catch(e){
    console.log("Candle fetch error:",symbol)
    return []
  }

}

// ===============================
// ANALYZE STOCK
// ===============================
async function analyzeStock(q){

  const price=q.regularMarketPrice||0
  const prev=q.regularMarketPreviousClose||0
  const open=q.regularMarketOpen||0

  const volume=q.regularMarketVolume||0
  const avgVolume=q.averageDailyVolume3Month||1

  if(price<30||price>5000) return null

  const momentum=((price-prev)/prev)*100
  const gap=((open-prev)/prev)*100
  const vol_ratio=volume/avgVolume
  const moveFromOpen=((price-open)/open)*100

  const dayHigh = q.regularMarketDayHigh || price
  const dayLow = q.regularMarketDayLow || price

  const distanceFromHigh = ((dayHigh - price) / dayHigh) * 100

  const vwap = (dayHigh + dayLow + price) / 3
  const belowVWAP = price < vwap

  // 🔴 GET CANDLES
  const candles = await get5MinCandles(q.symbol)

  let prevHigh=null
  let prevLow=null

  if(candles.length >= 2){
    const prevCandle = candles[candles.length - 2]
    prevHigh = prevCandle.high
    prevLow = prevCandle.low
  }

  const score =
      momentum*25+
      moveFromOpen*35+
      vol_ratio*40

  const shortScore =
      (-momentum)*30 +
      (-moveFromOpen)*40 +
      vol_ratio*30

  return{
    symbol:q.symbol,
    price,
    momentum,
    gap,
    vol_ratio,
    moveFromOpen,
    vwap,
    belowVWAP,
    score,
    shortScore,
    distanceFromHigh,
    prevHigh,
    prevLow
  }
}

// ===============================
// MAIN ENGINE
// ===============================
export async function runScannerEngine(quotes){

  const analyzed = await Promise.all(
    quotes.map(q=>analyzeStock(q))
  )

  const stocks = analyzed.filter(Boolean)

  const result={
    top:[],
    shortCandidates:[]
  }

  for(const s of stocks){

    if(!s) continue

    // 🟢 BUY FILTER
    if(
      s.momentum > 1 &&
      s.vol_ratio > 1.2 &&
      s.moveFromOpen > 0.6 &&
      s.moveFromOpen < 2.2 &&
      s.distanceFromHigh > 0.4
    ){
      result.top.push(s)
    }

    // 🔴 SHORT FILTER (loose)
    if(
      s.momentum < -0.3 &&
      s.moveFromOpen < -0.2 &&
      s.vol_ratio > 1.1
    ){
      result.shortCandidates.push(s)
    }

  }

  result.top.sort((a,b)=>b.score-a.score)
  result.shortCandidates.sort((a,b)=>b.shortScore-a.shortScore)

  return result
}