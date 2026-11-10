import {useEffect,useState} from 'react';
import {asOf,withPreviousSnapshot,type DecisionProof} from '@/lib/decision-proof';
import type {SealSnapshot} from '@/lib/closing-signals';
import {loadDecisionProof} from '@/lib/load-decision-proof';
import type {Market} from '@/lib/market-types';

export function useDecisionProof(market:Market|null,codes:string[]=[],industry='',records:SealSnapshot[]=[]){
 const data=market?withPreviousSnapshot(market,records):null;
 const [result,setResult]=useState<{key:string;proof:DecisionProof}|null>(null);
 const key=data?.tradeDate&&!data.cached?[
  data.tradeDate,Math.floor(asOf(data)/60000),data.research?.previousPool?.date,data.research?.previousPool?.total,industry,...codes,
 ].join('/'):'';
 useEffect(()=>{
  if(!key||!data)return;
  let active=true;
  void loadDecisionProof(data,codes,industry).then(proof=>{if(active)setResult({key,proof});}).catch(()=>{});
  return ()=>{active=false;};
 },[key]);
 return result?.key===key?result.proof:null;
}
