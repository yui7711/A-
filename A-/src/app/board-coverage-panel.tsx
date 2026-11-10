import {useEffect,useState} from 'react';
import {addBoardTrends,captureBoards,coverageMatchesMarket,rankCoveredBoards,type BoardCoverage} from '@/lib/board-universe';
import {asOf} from '@/lib/decision-proof';
import type {SealSnapshot} from '@/lib/closing-signals';
import type {History,Market} from '@/lib/market-types';
import {fetchPublicJSON} from '@/lib/public-transport';
import {marketClock} from '@/lib/tactics';
import {requestJSON} from '@/lib/client-request';
import {symbol} from '@/lib/market-core';

type Props={data:Market|null;records:SealSnapshot[];onStock:(code:string,name:string)=>void;mode:'topics'|'rotation'|'roles'};
const cash=(n:number|null|undefined)=>n==null?'未取到':(n/1e8).toFixed(2)+' 亿';
const pct=(n:number|null|undefined)=>n==null?'未取到':(n>0?'+':'')+n.toFixed(2)+'%';
const cache=new Map<string,Promise<BoardCoverage|null>>();

export function BoardCoveragePanel({data,records,onStock,mode}:Props){
 const [loaded,setLoaded]=useState<{key:string;coverage:BoardCoverage|null}|null>(null);
 const archived=data&&coverageMatchesMarket(data,data.boardCoverage)?data.boardCoverage:null;
 const key=data?.tradeDate&&!data.cached?[`c${data.tradeDate}`,data.themeBasis,Math.floor(asOf(data)/120000)].join('/'):'';
 useEffect(()=>{
  if(!data||!key||archived||data.tradeDate!==marketClock().date)return;
  let active=true;
  let pending=cache.get(key);
  if(!pending){
   pending=captureBoards(data,fetchPublicJSON)
    .then(coverage=>coverage?addBoardTrends(data,coverage,code=>requestJSON<History>('/api/history?code='+symbol(code)+'&mode=day',{},{timeoutMs:7000})):null)
    .catch(()=>null);
   cache.set(key,pending);
   if(cache.size>5)cache.delete(cache.keys().next().value!);
  }
  void pending.then(coverage=>{if(active)setLoaded(previous=>({key,coverage:coverage??previous?.coverage??null}));});
  return ()=>{active=false;};
 },[key,archived]);
 const coverage=archived??loaded?.coverage??null;
 const previous=records.filter(s=>s.origin==='cloud'&&s.date===data?.research?.previousDate&&s.slot==='late'&&s.market)
  .sort((a,b)=>Number(!!b.market?.boardCoverage)-Number(!!a.market?.boardCoverage)||Number(b.source==='东方财富')-Number(a.source==='东方财富'))[0]?.market;
 const rows=data?rankCoveredBoards(data,coverage,previous):[];
 const directions=rows.filter(x=>x.complete&&x.before!=null&&x.width>=3&&x.width>x.before)
  .sort((a,b)=>b.hot-a.hot||(b.width-b.before!)-(a.width-a.before!)).slice(0,3);
 const title=mode==='rotation'?'新方向雷达':mode==='roles'?'板块角色一览':'概念与行业成分榜';
 return <section className="panel reference-panel">
  <h3>{title}</h3>
  {rows.length?<><p>{coverage?.date} · 东方财富板块成分与同一时段行情，逐股匹配当前涨停池。成分相近的板块合并展示。</p>
   {mode==='rotation'&&<p><strong>{directions.length?'新方向候选 · '+directions.map(r=>`${r.board.name}（涨停 ${r.before} → ${r.width}）`).join('、'):'暂未找到有可比增量的板块'}</strong>
    {directions.length>0&&'。正式主线切换仍按下方手册条件确认。'}</p>}
   <div className="reference-table"><table><thead><tr><th>板块</th><th>涨停 / 梯队</th><th>高度龙头</th><th>中军候选</th><th>补涨候选</th></tr></thead>
    <tbody>{rows.slice(0,mode==='rotation'?6:10).map(row=>{
     const trend=row.middle?coverage?.trends?.[row.middle.code]:null;
     const volume=row.follower?coverage?.trends?.[row.follower.code]?.volumeRatio:null;
     return <tr key={row.board.code}>
     <td><b>{row.board.name}</b><br/><small>{row.board.kind} · {pct(row.board.change)} · 主力 {cash(row.board.flow)}<br/>成分 {row.board.members.length}/{row.board.total}{row.aliases.length?` · 同族 ${row.aliases.join('、')}`:''}</small></td>
     <td>{row.before!=null?`${row.before} → `:''}{row.complete?'':'至少 '}{row.width} 只<br/><small>{row.ladder.join(' / ')} 板{row.before!=null&&!row.sameMembership?' · 前值按当前成分回算':''}</small></td>
     <td><button className="text-btn" onClick={()=>onStock(row.leader.code,row.leader.name)}>{row.leader.name}</button><br/><small>{row.leader.boards} 板 · {pct(row.leader.change)} · 首封 {row.leader.time||'待核验'}<br/>换手 {pct(row.leader.turnover)} · 封单 {cash(row.leader.seal)}</small></td>
     <td>{row.middle?<><button className="text-btn" onClick={()=>onStock(row.middle!.code,row.middle!.name)}>{row.middle.name}</button><br/><small>{pct(row.middle.change)} · 成交 {cash(row.middle.amount)} · 流通 {cash(row.middle.cap)}<br/>主力 {cash(row.middle.flow)} · {trend?.aligned===true?'5/10/20 日线多头':trend?.aligned===false?'均线未呈多头':'趋势待核验'}{trend?.volumeRatio!=null?` · 量比 ${trend.volumeRatio.toFixed(2)}`:''}</small></>:<small>缺同刻报价或符合体量的非涨停成分</small>}</td>
     <td>{row.follower?<><button className="text-btn" onClick={()=>onStock(row.follower!.code,row.follower!.name)}>{row.follower.name}</button><br/><small>{row.follower.boards} 板 · 首封 {row.follower.time||'待核验'}{volume!=null?` · 量比 ${volume.toFixed(2)}`:''}<br/>{row.structuralFollower?'已核实板位和早盘时点，业务关联待核验':row.highest<4?'低位跟随样本，高度股尚未到 4 板':'低位跟随样本，首封时序待核验'}</small></>:<small>当前成分中暂无低位涨停样本</small>}</td>
    </tr>})}</tbody></table></div></>:<p>{loaded?.key===key?'成分接口暂无同一时段有效数据，下面保留原涨停池结果。':data?.tradeDate===marketClock().date?'正在读取概念和行业成分…':'该时段暂无板块成分归档，下面保留原涨停池结果。'}</p>}
 </section>;
}
