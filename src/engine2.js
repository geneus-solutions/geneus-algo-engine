function analyzeStock(q){

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
// existing bullish score
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
    distanceFromHigh
  }

}

function classifyStocks(stocks){

  const result={
    top:[],
    weak:[],
    gap:[],
    shortCandidates:[]
  }

  for(const s of stocks){

    if(!s) continue
    // avoid dead volume
    if (s.vol_ratio < 0.25) continue

    // =========================
    // ✅ BUY (Pullback logic)
    // =========================

    const strongTrend =
      s.momentum > 1 &&
      s.vol_ratio > 1.2

    const pullbackZone =
      s.moveFromOpen > 0.6 &&
      s.moveFromOpen < 2.2

    const notNearTop =
      s.distanceFromHigh > 0.4

    if(
      strongTrend &&
      pullbackZone &&
      notNearTop
    ){
      result.top.push(s)
    }

    // =========================
    // ⚠ Weak
    // =========================
    if(s.momentum < -0.5){
      result.weak.push(s)
    }

    // =========================
    // 🔥 GAP
    // =========================
    if(Math.abs(s.gap)>1){
      result.gap.push(s)
    }

    // =========================
    // 🔴 SHORT (LOOSENED)
    // =========================

    // early weakness
    if(
      s.momentum < -0.3 &&
      s.moveFromOpen < -0.2 &&
      s.vol_ratio > 1.1
    ){
      result.shortCandidates.push({
        ...s,
        tag:"EARLY_WEAK"
      })
    }

    // failed gap (BEST)
    if(
      s.gap > 0.8 &&
      s.moveFromOpen < -0.2 &&
      s.vol_ratio > 1.2
    ){
      result.shortCandidates.push({
        ...s,
        tag:"FAILED_GAP"
      })
    }

    // VWAP breakdown
    if(
      s.belowVWAP &&
      s.momentum < -0.3 &&
      s.vol_ratio > 1.1
    ){
      result.shortCandidates.push({
        ...s,
        tag:"VWAP_BREAK"
      })
    }

  }

  result.top.sort((a,b)=>b.score-a.score)
  result.shortCandidates.sort((a,b)=>b.shortScore-a.shortScore)

  return result
}


export function runScannerEngine(quotes){
  return classifyStocks(quotes.map(analyzeStock).filter(Boolean))
}