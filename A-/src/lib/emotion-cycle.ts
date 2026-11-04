export const emotionStages=[
 {id:'ice',name:'冰点',color:'muted',description:'涨停与高度低，赚钱效应弱'},
 {id:'start',name:'启动',color:'priority',description:'样本与梯队开始建立，等待持续性'},
 {id:'ferment',name:'发酵',color:'positive',description:'涨停扩散，梯队与指数配合'},
 {id:'climax',name:'高潮',color:'watch',description:'广度、高度与封板质量同时较强'},
 {id:'divide',name:'分歧',color:'watch',description:'炸板增多或指数与题材表现分化'},
 {id:'decline',name:'衰退',color:'risk',description:'封板、指数或跌停压力明显恶化'},
] as const;
type Input={valid:boolean;up:number|null;down:number|null;blast:number|null;highest:number|null;average:number|null;severeRisk:boolean;known:number};
/** Snapshot classification, not elapsed time or a prediction of the next stage. Conditions are disjoint by precedence. */
export function locateEmotionCycle(x:Input){
 if(!x.valid||x.up==null||x.down==null||x.blast==null||x.highest==null||x.average==null)return {id:'unknown',name:'待验证',color:'muted',index:-1,basis:'核心统计、完整名单或有效指数未齐，暂不定位阶段',matched:[] as string[],coverage:x.known};
 let id:typeof emotionStages[number]['id'];
 if(x.up<15&&x.highest<=1&&(x.blast>=.4||x.average<0))id='ice';
 else if(x.severeRisk||x.blast>=.45)id='decline';
 else if(x.up>=80&&x.highest>=5&&x.blast<.15&&x.average>0)id='climax';
 else if(x.blast>=.35||x.average<-.5&&x.up>=40)id='divide';
 else if(x.up>=60&&x.highest>=3&&x.average>=-.5)id='ferment';
 else if(x.up>=25&&x.highest>=2||x.up<25&&x.average>=0&&x.blast<.35)id='start';
 else id=x.up<25?'ice':'divide';
 const index=emotionStages.findIndex(s=>s.id===id),stage=emotionStages[index];
 return {...stage,index,basis:'当前快照定位 · 阶段可跨越或回退，不是时间百分比',matched:[`涨停 ${x.up} 家`,`最高 ${x.highest} 板`,`炸板率 ${(x.blast*100).toFixed(1)}%`,`指数均值 ${x.average>=0?'+':''}${x.average.toFixed(2)}%`],coverage:x.known};
}
