// scannerService.js

import YahooFinance from "yahoo-finance2";
import { NIFTY200 } from "./data/nifty200.js";
const yahooFinance = new YahooFinance({
  suppressNotices:["yahooSurvey"]
});

/*
=========================================================
REDIS (future use)
=========================================================
*/

// import redisClient from "../redisClient.js";
// const CACHE_KEY="scanner_cache";

/*
=========================================================
CACHE
=========================================================
*/

let cache=null;
let lastFetch=0;

/*
=========================================================
FETCH QUOTES
=========================================================
*/

async function fetchQuotes(symbols){

  try{

    if(Date.now()-lastFetch<5000 && cache){
      return cache;
    }

    const quotes=await yahooFinance.quote(symbols);

    cache=quotes;
    lastFetch=Date.now();

    return quotes;

  }catch(err){

    console.error("❌ Yahoo Finance fetch error:",err.message);

    return [];

  }

}

/*
=========================================================
STOCK ANALYSIS
=========================================================
*/

function analyzeStock(q){

  try{

    const price=q.regularMarketPrice||0;
    const prev=q.regularMarketPreviousClose||0;
    const open=q.regularMarketOpen||0;

    const volume=q.regularMarketVolume||0;
    const avgVolume=q.averageDailyVolume3Month||1;

    if(price<30||price>5000) return null;

    const momentum=((price-prev)/prev)*100;
    const vol_ratio=volume/avgVolume;
    const gap=((open-prev)/prev)*100;

    const vwap=(price*volume)/avgVolume;

    let score=
      momentum*50+
      vol_ratio*30+
      gap*20;

    if(price>vwap) score+=10;

    return{
      symbol:q.symbol,
      price,
      momentum,
      vol_ratio,
      gap,
      score
    };

  }catch(err){

    console.error("⚠ Stock analysis error:",q?.symbol,err.message);
    return null;

  }

}

/*
=========================================================
SIGNAL CLASSIFICATION
=========================================================
*/

function classifyStocks(stocks){

  try{

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
      //old
       if(s.momentum>0.5 && s.vol_ratio>0.8)

       //opt
       /* if(
        s.momentum > 1 &&
        s.vol_ratio > 1 &&
        s.moveFromOpen > 0
      )*/{
        result.top.push(s);
      }

      if(s.momentum<-0.5 && s.vol_ratio>0.8)
        result.weak.push(s);

      if(Math.abs(s.gap)>1)
        result.gap.push(s);

      //STIDU
         //if(s.vol_ratio>2)
       if(
          s.vol_ratio > 1.5 &&
          s.momentum > 0.7
        ){
          result.volumeSpikes.push(s);
        }
      //old
        if (
          s.gap > 0.5 &&
          s.momentum > 1 &&
          s.vol_ratio > 1.5
        ) {
          result.breakout.push(s);
        }
        //opt
       /* if (
          s.momentum > 1 &&
          s.vol_ratio > 1.2 &&
          s.moveFromOpen > 0.5 &&
          s.moveFromOpen < 3
        ){
          result.breakout.push(s);
        }*/
       //old
   if(s.score>bestScore && s.gap>1 && s.vol_ratio>1.5){
        bestScore=s.score;
        result.stockOfTheDay=s;
      }
        //opt
      /*if(
        s.score > bestScore &&
        s.momentum > 1 &&
        s.vol_ratio > 1.3 &&
        s.moveFromOpen > 0.5
      ){
        bestScore = s.score;
        result.stockOfTheDay = s;
      }*/
    }
    result.top.sort((a,b)=>b.score-a.score);
    result.breakout.sort((a,b)=>b.score-a.score);
    result.volumeSpikes.sort((a,b)=>b.score-a.score);

    return result;

  }catch(err){

    console.error("❌ Stock classification error:",err.message);

    return {
      top:[],
      weak:[],
      gap:[],
      volumeSpikes:[],
      breakout:[],
      stockOfTheDay:null
    };

  }

}

/*
=========================================================
MAIN SCANNER
=========================================================
*/

export async function scanMarket2(){

  try{

    const quotes=await fetchQuotes(NIFTY200);

    const analyzed=quotes
      .map(analyzeStock)
      .filter(Boolean);

    const result=classifyStocks(analyzed);

    return result;

  }catch(err){

    console.error("🔥 Scanner engine failed:",err.message);

    return {
      top:[],
      weak:[],
      gap:[],
      volumeSpikes:[],
      breakout:[],
      stockOfTheDay:null
    };

  }

}