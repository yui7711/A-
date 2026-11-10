import {BookOpen,Calculator} from 'lucide-react';

const handbook='./handbook/index.html';
const originalTools=[
 {id:'thermo',name:'情绪温度计',detail:'九项指标与情绪方向'},
 {id:'mainline',name:'主线强度',detail:'六维评分与主支线分级'},
 {id:'diverge',name:'分歧性质',detail:'十二项证据交叉核验'},
 {id:'dragon',name:'龙头体检',detail:'成色与见顶信号'},
 {id:'locate',name:'周期定位',detail:'六问匹配原版八阶段'},
];

export function HandbookWorkbench({onGuide,onLive}:{onGuide:()=>void;onLive:()=>void}){
 return <section className="panel handbook-workbench" aria-label="完整手册与原版判定工作台">
  <div className="workbench-head">
   <div><span className="section-step">情绪周期工作台</span><h2>读原文，按原版规则判定</h2>
    <p>完整手册 26 章与五项原版工具。温度计从同一份已核验快照预填四项数据。</p></div>
   <a className="secondary-btn" href={handbook}><BookOpen size={16}/>完整手册</a>
  </div>
  <div className="workbench-tools">{originalTools.map(t=><a key={t.id} href={handbook+'?tool='+t.id}>
   <Calculator size={15}/><strong>{t.name}</strong><small>{t.detail}</small>
  </a>)}</div>
  <div className="button-row workbench-secondary">
   <button className="text-btn" onClick={onGuide}>曜石口径速查</button>
   <button className="text-btn" onClick={onLive}>实时行情辅助判定</button>
  </div>
 </section>;
}
