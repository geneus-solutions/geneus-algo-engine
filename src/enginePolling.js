// algo-engine/engine.js

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

  const dayHigh=q.regularMarketDayHigh||price
  const dayLow=q.regularMarketDayLow||price

  const distanceFromHigh=((dayHigh-price)/dayHigh)*100
  const distanceFromLow=((price-dayLow)/dayLow)*100

  // better vwap approximation
  const vwap=(dayHigh+dayLow+price)/3

  const aboveVWAP=price>vwap
  const belowVWAP=price<vwap

  const score=
      momentum*25+
      moveFromOpen*35+
      vol_ratio*40

  const shortScore=
      (-momentum)*30+
      (-moveFromOpen)*40+
      vol_ratio*30

  return{
    symbol:q.symbol,
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
    score,
    shortScore
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

    if(s.vol_ratio<0.25) continue

    // ====================================
    // 🚀 BUY ENGINE
    // ====================================

    const strongTrend=
      s.momentum>1 &&
      s.vol_ratio>1.2

    const pullbackZone=
      s.moveFromOpen>0.6 &&
      s.moveFromOpen<2

    const notAtTop=
      s.distanceFromHigh>0.4

    const healthyTrend=
      s.distanceFromHigh<1.5

    if(
      strongTrend &&
      pullbackZone &&
      notAtTop &&
      healthyTrend
    ){
      result.top.push(s)
    }

    // ====================================
    // ⚠ WEAK
    // ====================================

    if(
      s.momentum<-0.5 &&
      s.vol_ratio>1
    ){
      result.weak.push(s)
    }

    // ====================================
    // 🔥 GAP
    // ====================================

    if(Math.abs(s.gap)>1){
      result.gap.push(s)
    }

    // ====================================
    // 🔴 SHORTS
    // ====================================

    // mild weakness
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

    // failed gap
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

    // vwap breakdown
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

export function runScannerEnginePolling(quotes){

  const analyzed=quotes
    .map(analyzeStock)
    .filter(Boolean)

  return classifyStocks(analyzed)

}