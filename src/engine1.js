// algo-engine/engine.js

function analyzeStock(q){

  const price=q.regularMarketPrice||0;
  const prev=q.regularMarketPreviousClose||0;
  const open=q.regularMarketOpen||0;

  const volume=q.regularMarketVolume||0;
  const avgVolume=q.averageDailyVolume3Month||1;

  if(price<30||price>5000) return null;

  const momentum=((price-prev)/prev)*100;
  const vol_ratio=volume/avgVolume;
  const gap=((open-prev)/prev)*100;

  const moveFromOpen=((price-open)/open)*100;

  let score =
    momentum*50+
    vol_ratio*30+
    gap*20;

  return{
    symbol:q.symbol,
    price,
    momentum,
    vol_ratio,
    gap,
    moveFromOpen,
    score
  };
}

function classifyStocks(stocks){

  const result={
    top:[],
    weak:[],
    gap:[],
    volumeSpikes:[],
    breakout:[],
    stockOfTheDay:null
  };

  let bestScore=-Infinity;

  for(const s of stocks){

    if(!s) continue;

    if(
      s.momentum>1 &&
      s.vol_ratio>1 &&
      s.moveFromOpen>0
    ){
      result.top.push(s);
    }

    if(s.momentum<-0.5 && s.vol_ratio>0.8)
      result.weak.push(s);

    if(Math.abs(s.gap)>1)
      result.gap.push(s);

    if(
      s.vol_ratio>1.5 &&
      s.momentum>0.7
    ){
      result.volumeSpikes.push(s);
    }

    if(
      s.momentum>1 &&
      s.vol_ratio>1.2 &&
      s.moveFromOpen>0.5 &&
      s.moveFromOpen<3
    ){
      result.breakout.push(s);
    }

    if(
      s.score>bestScore &&
      s.momentum>1 &&
      s.vol_ratio>1.3 &&
      s.moveFromOpen>0.5
    ){
      bestScore=s.score;
      result.stockOfTheDay=s;
    }

  }

  result.top.sort((a,b)=>b.score-a.score);
  result.breakout.sort((a,b)=>b.score-a.score);
  result.volumeSpikes.sort((a,b)=>b.score-a.score);

  return result;
}

export function runScannerEngine(quotes){

  const analyzed=quotes
    .map(analyzeStock)
    .filter(Boolean);

  return classifyStocks(analyzed);

}
