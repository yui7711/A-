import {useEffect,useState} from 'react';
import {asOf,cnMinute,withPreviousSnapshot,type DecisionProof} from '@/lib/decision-proof';
import {sealSource,type SealSnapshot} from '@/lib/closing-signals';
import {loadDecisionProof} from '@/lib/load-decision-proof';
import type {Market} from '@/lib/market-types';

export function useDecisionProof(market:Market|null,codes:string[]=[],industry='',records:SealSnapshot[]=[]){
 const data=market?withPreviousSnapshot(market,records):null;
 const [result,setResult]=useState<{scope:string;proof:DecisionProof}|null>(null);
 const scope=data?.tradeDate&&!data.cached?[
  data.tradeDate,data.themeBasis,sealSource(data)??data.providerMode,Number(cnMinute(asOf(data))>=900),industry,...codes,
 ].join('/'):'';
 const key=scope&&data?[scope,Math.floor(asOf(data)/60000),data.research?.previousPool?.date,data.research?.previousPool?.total,data.decisionFeedback?.quotes.length].join('/'):'';
 useEffect(()=>{
  if(!key||!data)return;
  let active=true;
  void loadDecisionProof(data,codes,industry).then(proof=>{if(active)setResult({scope,proof});}).catch(()=>{});
  return ()=>{active=false;};
 },[key]);
 return data&&result?.scope===scope&&Math.abs(asOf(data)-result.proof.at)<=180000?result.proof:null;
}
