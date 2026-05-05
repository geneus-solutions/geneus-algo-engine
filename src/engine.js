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
  
  const dayHigh = q.regularMarketDayHigh || price
  const distanceFromHigh = ((dayHigh - price) / dayHigh) * 100

  // approximate VWAP
  const vwap=(price*volume)/avgVolume

  // professional breakout scoring
 const score =
      momentum*25+
      moveFromOpen*35+
      vol_ratio*40

  return{
    symbol:q.symbol,
    price,
    momentum,
    gap,
    vol_ratio,
    moveFromOpen,
    vwap,
    score,
    distanceFromHigh
  }

}

function classifyStocks(stocks){

  const result={
    top:[],
    weak:[],
    gap:[],
    volumeSpikes:[],
    breakout:[],
    stockOfTheDay:null,
    fallingStocks:[]
  }

  let bestScore=-Infinity


  for(const s of stocks){

    if(!s) continue

      // avoid falling stocks
    if (s.moveFromOpen < 0.15) {
      result.fallingStocks.push(s)
      continue
    }

    // avoid dead volume
    if (s.vol_ratio < 0.25) continue

    // basic momentum
    if (s.momentum < 0.25) continue

    // avoid stocks far from high
    if (s.distanceFromHigh > 2) continue

    // breakout candidates
    if(
      s.momentum>1 &&
      s.vol_ratio>1.2 &&
      s.moveFromOpen>0.5
    ){
      result.top.push(s)
    }

    // weak stocks
    if(
      s.momentum<-0.7 &&
      s.vol_ratio>1
    ){
      result.weak.push(s)
    }

    // gap stocks
    if(Math.abs(s.gap)>1){
      result.gap.push(s)
    }

    // volume spikes
    if(
      s.vol_ratio>1.8 &&
      s.momentum>0.8
    ){
      result.volumeSpikes.push(s)
    }

  // breakout detection
    if(
      s.moveFromOpen > 0.6 &&
      s.vol_ratio > 1.3 &&
      s.momentum > 0.8 &&
      s.distanceFromHigh < 0.8
    ){
      result.breakout.push(s)
    }

    // stock of the day
    if(
      s.score > bestScore &&
      s.moveFromOpen > 0.8 &&
      s.vol_ratio > 1.5 &&
      s.distanceFromHigh < 0.5
    ){
      bestScore=s.score
      result.stockOfTheDay=s
    }

  }

  result.top.sort((a,b)=>b.score-a.score)
  result.breakout.sort((a,b)=>b.score-a.score)
  result.volumeSpikes.sort((a,b)=>b.score-a.score)

  return result

}

export function runScannerEngine(quotes){

  const analyzed=quotes
    .map(analyzeStock)
    .filter(Boolean)

  return classifyStocks(analyzed)

}