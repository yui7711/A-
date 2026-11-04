import type {Market,ResearchEvidence,Stock} from './market-types';
import {createResearchEvidenceLoader,researchCutoff} from './research-evidence.ts';
import {symbol} from './market-core.ts';
type Pool=NonNullable<ResearchEvidence['previousPool']>;
export function verifiedHistoryPool(date:string,pools:Pool[]){
 return pools.find(p=>p&&p.date===date&&p.complete&&Number.isFinite(p.total)&&p.total>=0&&Array.isArray(p.stocks)&&p.stocks.length===p.total&&p.stocks.every(s=>s&&/^\d{6}$/.test(s.code))&&new Set(p.stocks.map(s=>s.code)).size===p.total);
}
/** Public historical rosters come from this Pages site; live quotes never use a private key. */
export function createPublicResearchClient(json:(url:string)=>Promise<any>,now=Date.now,history:()=>Promise<Pool[]>=async()=>[]){
 let archive:Pool[]=[];
 const industries=new Map<string,string>();
 const evidence=createResearchEvidenceLoader({json,now,fy:async()=>{throw Error('公开备用通道不使用同花顺凭证');},historicalPool:async date=>{const pool=verifiedHistoryPool(date,archive);if(!pool)throw Error('历史对照未齐');return pool;}});
 async function mapIndustries(data:Market):Promise<Market>{
  const prior=data.research?.previousPool;if(!prior)return data;
  const all=[...data.stocks,...prior.stocks].filter(s=>!s.isST),missing=[...new Set(all.map(s=>s.code))].filter(c=>!industries.has(c));
  for(let i=0;i<missing.length;i+=40){const codes=missing.slice(i,i+40),secids=codes.map(c=>(symbol(c).startsWith('sh')?'1.':'0.')+c).join(',');
   try{const j=await json('https://push2.eastmoney.com/api/qt/ulist.np/get?secids='+secids+'&fields=f12,f14,f100&fltt=2');
   for(const row of Object.values(j?.data?.diff||{}) as any[])if(codes.includes(String(row.f12))&&typeof row.f100==='string'&&row.f100.trim()&&row.f100!=='-')industries.set(String(row.f12),row.f100.trim());}catch{/* Preserve verified mappings from other batches. */}
  }
  const coverage=(stocks:Stock[])=>stocks.filter(s=>!s.isST&&industries.has(s.code)).length;
  const themeCoverage={current:coverage(data.stocks),currentTotal:data.stocks.filter(s=>!s.isST).length,previous:coverage(prior.stocks),previousTotal:prior.stocks.filter(s=>!s.isST).length};
  const absent=[...new Set(all.filter(s=>!industries.has(s.code)).map(s=>s.code))];
  const mapped=(stocks:Stock[])=>stocks.map(s=>({...s,themes:s.isST?s.themes:industries.has(s.code)?[industries.get(s.code)!]:[]}));
  const stocks=mapped(data.stocks),themes=new Map<string,Market['themes'][number]>();for(const s of stocks.filter(s=>!s.isST))for(const name of s.themes){const row=themes.get(name)||{name,count:0,leaders:[]};row.count++;if(row.leaders.length<3)row.leaders.push(s.name);themes.set(name,row);}
  return {...data,stocks,themes:[...themes.values()].sort((a,b)=>b.count-a.count),themeBasis:'industry',research:{...data.research!,themeCoverage,issues:[...data.research!.issues,...(absent.length?[`行业未覆盖 ${absent.length} 只（${absent.join('、')}），保留原始原因；主线留存暂停，量能独立计算`]:[])],previousPool:{...prior,stocks:mapped(prior.stocks),taxonomy:'industry',source:prior.source+' · 东方财富当前行业对照'}}};
 }
 return async function enrich(data:Market,snapshot:Market|null=null):Promise<Market>{
  if(!data.tradeDate)return data;
  archive=await history().catch(()=>[]);if(snapshot?.research?.previousPool)archive=[...archive,snapshot.research.previousPool];
  const research=await evidence(data.tradeDate,researchCutoff(data,now())).catch(()=>null);if(!research)return data;
  let result:Market={...data,research,themeBasis:'industry'};
  try{result=await mapIndustries(result);}catch{result.research={...research,issues:[...research.issues,'当前行业映射未齐，主线历史对照暂停计算']};if(result.research.previousPool)result.research.previousPool={...result.research.previousPool,taxonomy:'reason'};}
  const r=result.research!;
  const c=r.themeCoverage;
  return {...result,sources:[...data.sources,
   {id:'research-themes',name:'六维 · 行业覆盖',status:c&&c.current===c.currentTotal&&c.previous===c.previousTotal?'ok':'partial',mode:'live',checkedAt:r.fetchedAt,date:data.tradeDate,url:'https://quote.eastmoney.com/',message:c?`当日 ${c.current}/${c.currentTotal}；历史名单 ${c.previous}/${c.previousTotal}。未覆盖股票不强行归类；行业留存与量能独立判断。`:'行业对照暂未齐备；不影响已核实的同刻量能'},
   {id:'research-volume',name:'六维 · 公开沪深同刻量能',status:r.volume?'ok':'partial',mode:'live',checkedAt:r.fetchedAt,date:r.volume?.date||data.tradeDate,url:r.volume?.source.includes('东方财富')?'https://quote.eastmoney.com/':'https://gu.qq.com/',message:r.volume?`${r.volume.source}；${r.previousDate} → ${data.tradeDate}；共同截点 ${r.volume.cutoff}；金额单位元`:'两日同一分钟的沪深金额未齐，未以昨日全天值替代'},
   {id:'research-pool',name:'六维 · 同站公开历史名单',status:r.previousPool?.complete?'ok':'partial',mode:'close',checkedAt:r.fetchedAt,date:r.previousDate,url:'https://yui7711.github.io/A-/data/history.json',message:r.previousPool?`${r.previousPool.source}；完整名单 ${r.previousPool.stocks.length}/${r.previousPool.total}；历史名单来自同站，行业映射不冒充涨停原因`:'上一交易日完整涨停池未取得，保留真实缺失状态'}]};
 };
}
