import type {Market} from './market-types';
import {buildClosingSignals,type SealSnapshot} from './closing-signals.ts';
import {assessTactics} from './tactics.ts';
import {buildResearch} from './research.ts';
export function nextOutlook(data:Market|null,records:SealSnapshot[],now:number){
 const context=assessTactics(data,now),r=buildResearch(data,context),s=buildClosingSignals(data,records,now);
 if(!s.valid)return {tone:'muted',title:'证据不足 · 暂停预测',strength:'不足',basis:[context.dataIssue||'完整同日行情待齐备'],base:'先恢复有效行情，暂不判断下一交易日方向。',better:'数据恢复后重新推演。',worse:'数据异常未解除前不提升判断等级。'};
 const weak=r.defensive||s.riskCount>0||r.blast!=null&&r.blast>=.35||r.history.volumeRatio!=null&&r.history.volumeRatio<.85&&r.avg!=null&&r.avg<0;
 const repair=!weak&&r.avg!=null&&r.avg>=0&&r.blast!=null&&r.blast<.18&&(r.mainlines.lines[0]?.count||0)>=5;
 const basis=[`四指数均值 ${r.avg?.toFixed(2)??'—'}%；炸板率 ${r.blast==null?'—':(r.blast*100).toFixed(1)+'%'}`,`涨停 ${r.up??'—'} 家，首位主线 ${r.mainlines.lines[0]?.name||'未归类'} / ${r.mainlines.lines[0]?.count??0} 只`,`${s.riskCount} 只高标触及封单核心警示；午盘对照 ${s.rows.filter(x=>x.change!=null).length}/${s.rows.length} 只`,r.history.volumeRatio==null?'同刻量能对照缺失，不加入方向判断':`两市同刻成交额为昨日 ${(r.history.volumeRatio*100).toFixed(1)}%`];
 return {tone:weak?'risk':repair?'positive':'watch',title:weak?'下一交易日倾向 · 偏弱延续':repair?'下一交易日倾向 · 修复观察':'下一交易日倾向 · 分歧震荡',strength:r.known===6&&s.hasComparison?'较充分':'有限',basis,
 base:weak?'基准情景：高位承接仍承压，数量反弹需要封单质量与指数共同验证；暂不假设退潮结束。':repair?'基准情景：现有主线与封板质量支持延续观察，仍需次日竞价和梯队跟随确认。':'基准情景：轮动与分歧并存，观察主线能否集中、薄封样本是否改善。',
 better:'向好情景：四指数均值转正、炸板率降至18%以下，首位主线至少5只且核心警示解除，再上调为修复观察。',
 worse:'失效 / 转弱：若封板率低于50%、四指数均值不高于−2%，或高标封单警示继续扩大，向好推演失效，优先重新评估风险。'};
}
