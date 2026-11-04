import type {Market} from './market-types';
export function marketRisk(data:Market|null,average:number|null){
 const up=data?.stats.up??null,down=data?.stats.down??null,opened=data?.stats.opened??null,rate=data?.stats.sealRate??null;
 const blast=up!=null&&opened!=null&&up+opened>0?opened/(up+opened):null;
 const stops:string[]=[],warnings:string[]=[];
 if(rate!=null&&Number.isFinite(rate)&&rate<.5)stops.push(`封板率 ${(rate*100).toFixed(1)}% < 50%`);
 if(average!=null&&average<=-2)stops.push(`四指数均值 ${average.toFixed(2)}% ≤ -2%`);
 if(up!=null&&down!=null&&down>=10&&down>=up*.7)stops.push(`跌停 ${down} 家 ≥ 涨停家数的70%，且至少10家`);
 if(blast!=null&&blast>=.25&&blast<=.5)warnings.push(`炸板率 ${(blast*100).toFixed(1)}% ≥ 25%（分歧谨慎项）`);
 if(up!=null&&up>0&&up<40)warnings.push(`涨停 ${up} 家 < 40 家（样本偏少）`);
 return {blast,stops,warnings,defensive:stops.length>0,caution:warnings.length>0,level:stops.length?'risk':warnings.length?'watch':'positive'};
}
