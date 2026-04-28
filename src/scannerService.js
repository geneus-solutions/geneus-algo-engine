// services/scannerService.js

import YahooFinance from "yahoo-finance2";
//import { runScannerEngine } from "../algo-engine/engine.js";
//import { runScannerEngine } from "../dist-algo/engine.js";
import { runScannerEngine } from "geneus-algo-engine";
import { NIFTY200 } from "./data/nifty200.js";
const yahooFinance=new YahooFinance({
  suppressNotices:["yahooSurvey"]
});

let cache=null;
let lastFetch=0;

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

    console.error("Yahoo fetch error",err.message);

    return [];

  }

}

export async function scanMarket(){

  try{

    const quotes=await fetchQuotes(NIFTY200);

    const result=runScannerEngine(quotes);

    return result;

  }catch(err){

    console.error("Scanner failed",err.message);

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