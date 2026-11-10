import {useState} from 'react';
import {BookOpen,ExternalLink,Search} from 'lucide-react';

const original='https://a9f3c7e21b84d5605.app.workbuddy.host/handbook/index.html?sharecode=34CRJ52WWX';
const terminal='https://a9f3c7e21b84d5605.app.workbuddy.host/?sharecode=34CRJ52WWX';

const chapters=[
 {id:'framework',title:'01　从市场到个股的判断顺序',entries:[
  ['市场环境','先看赚钱效应覆盖多少股票、是否向高位延伸，再看指数是否配合。指数上涨而短线炸板增多，应分别记录大盘与接力环境。'],
  ['题材与个股','同一个市场里，各题材和个股可以处在不同阶段。先确定市场约束，再核验主线和梯队，最后才给个股定位。'],
  ['判断记录','每条结论记下来源、时点、支持证据和失效条件。同口径才计算变化，数据暂缺时保留待核验。'],
 ]},
 {id:'cycle',title:'02　八阶段框架与曜石六阶段',entries:[
  ['冰点 → 修复','冰点关注出清范围和梯队断层。修复看涨停回升、炸板下降能否延续，少数超跌股反弹仅作线索。'],
  ['启动 → 确认','启动观察题材集中与前排形成。确认阶段再看板块广度、连板层级与成交能否同步扩大。曜石将确认中的扩散特征归入发酵观察。'],
  ['高潮 → 分歧','高潮表现为广度、高度与封板质量共振。随后若开板增多、核心和跟随股分化，进入分歧观察。'],
  ['退潮 → 崩塌','核心承接持续恶化时观察退潮。跌停扩散且梯队明显坍缩时，按更高风险处理。曜石以衰退作为这两个下行阶段的总标签，具体风险由数据列明。'],
 ]},
 {id:'turning',title:'03　拐点、强弱分歧与短暂反弹',entries:[
  ['上行观察','依次追踪恐慌停止扩大、修复扩散、新方向成形、梯队连续、热度加速。两个指标同向变化才提示线索，下一时点复核能否维持。'],
  ['下行观察','优先检查高位反复开板、领涨股承接走弱、亏钱效应向其他梯队扩散。收盘强弱与午盘涨停数量可出现背离。'],
  ['分歧复核','核心守住关键结构、回封兑现且有板块跟随，视为修复证据。核心与后排同时转弱、跌停增多，记为分歧恶化。'],
  ['短暂反弹','反弹集中于少数旧高标、缺少新梯队或没有量能验证时，继续观察。用后续持续性区分反抽和结构修复。'],
 ]},
 {id:'scoring',title:'04　六维评分与校准',entries:[
  ['评分看什么','曜石六维分别为同刻量能、梯队高度、晋级率、涨停广度、封板质量和指数配合。按可用维度等权计分并同时展示覆盖率。'],
  ['口径先核对','午盘量能与上一交易日同刻比较。晋级率从两期完整名单匹配。封板质量要核对涨停和炸板统计，回封率还需要完整的开板计数。'],
  ['如何校准','记录市场容量、流动性与样本变化，优先检验阈值在不同市场里的命中与误报。参考站的温度权重与曜石六维分数分开读。'],
 ]},
 {id:'themes',title:'05　题材生命周期、梯队与主线切换',entries:[
  ['主线与支线','按行业或概念去噪，再看涨停广度、最高板与连板层级。孤立首板、低覆盖或仅有人气抬升的方向，放到支线观察。'],
  ['题材生命周期','依次看消息带来的首批样本、跟随扩散、前排分化、回流和衰退。首日强度高但后续无承接时，按轮动线索记录。'],
  ['切换验证','旧方向掉队与新方向建立梯队是两条证据。只有榜首改名时记录为排名变化；后续还需用同口径名单和成交持续性验证。'],
 ]},
 {id:'roles',title:'06　龙头、中军、前排与补涨',entries:[
  ['龙头与前排','龙头看板块辨识度、连板高度、封板质量与带动性。前排可能因首封、辨识度或相对强度进入观察，单项排名需要复核。'],
  ['中军','看板块成交承载能力、流通体量和持续性。页面只能按涨停样本列出成交线索，确认需要全板块数据。'],
  ['中位、跟风与补涨','中位股应对照上方高度和下方晋级。跟风常依赖前排强弱。补涨需在主线仍有承接的前提下复核启动时点、联动和能否形成独立梯队。'],
 ]},
 {id:'operations',title:'07　操作研究与风险管理',entries:[
  ['把观察写成条件','用触发、验证和失效三项记录计划。按竞价、回封、换手或回踩观察时，记录对应的行情时点及缺口。'],
  ['角色匹配','龙头看分歧和带动，中军看量价持续，前排看与主线的联动，补涨看后续能否独立。出现核心风险时先复核市场，再检查个股。'],
  ['风险和退出','先定义总风险预算、观察失效位与复核时点。考虑涨跌停、跳空和成交不足。仓位与退出条件由使用者结合自身情况确定。'],
 ]},
 {id:'cases',title:'08　案例复核与常见误判',entries:[
  ['历史案例怎么读','参考原文中的产业链与低空经济案例，复盘时分别标出首次扩散、旧核心走弱、新核心形成与失败信号，并保留当时可见的证据。'],
  ['练习：假切换','例：新方向一度排第一，但全为首板，旧主线成交与梯队仍稳定。记录新方向冒头，下一时点再检验是否具备切换条件。'],
  ['练习：涨停增加但质量走弱','例：涨停数增加，同时高标封单下降、反复开板。分开记录数量和质量，优先核验高标风险。'],
 ]},
 {id:'routine',title:'09　盘前、盘中、盘后速查',entries:[
  ['盘前','从上一交易日收盘提取情绪档位、主线前三、连板断层与高标风险，写下当天要验证的条件。'],
  ['盘中','检查数据日期和源时间，再看周期、主线和个股角色。午盘留档，尾盘以同源快照对照封单。'],
  ['盘后','在复盘计划和复盘文章选择收盘版，逐项复查早先的判断。记录次日的验证点、失效点，以及仍未取得的数据。'],
 ]},
];

export function MethodHandbook({onToolbox}:{onToolbox:()=>void}){
 const [query,setQuery]=useState('');
 const [showOriginal,setShowOriginal]=useState(false);
 const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const visible=chapters.filter(c=>words.every(word=>[c.title,...c.entries.flat()].join(' ').toLowerCase().includes(word)));
 return <div className="method-handbook">
  <section className="panel handbook-intro">
   <div className="panel-heading"><div><h2><BookOpen size={19}/> 情绪周期判定手册</h2><p>本站规则、证据边界与盘中复核流程。可按概念搜索，也可打开参考站完整原文。</p></div></div>
   <div className="handbook-actions">
    <label><Search size={16}/><input aria-label="搜索手册" placeholder="搜索周期、分歧、补涨、风控…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <button type="button" className="secondary-btn" onClick={onToolbox}>打开判定工具箱</button>
    <button type="button" className="secondary-btn" aria-expanded={showOriginal} aria-controls="original-handbook" onClick={()=>setShowOriginal(v=>!v)}>{showOriginal?'收起站内原版':'在站内查看原版'}</button>
    <a className="secondary-btn" href={original} target="_blank" rel="noreferrer">打开完整原文 <ExternalLink size={14}/></a>
    <a className="text-btn" href={terminal} target="_blank" rel="noreferrer">参考终端 <ExternalLink size={13}/></a>
   </div>
   <nav className="handbook-index" aria-label="手册目录">{visible.map(c=><a key={c.id} href={'#method-'+c.id}>{c.title}</a>)}</nav>
  </section>
  <section id="original-handbook" className="panel original-handbook" hidden={!showOriginal}>
   {showOriginal&&<>
    <p>原版由参考站加载。也可在新标签打开原版手册与工具箱。</p>
    <iframe title="原版情绪周期判定手册与工具箱" src={original} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin"/>
   </>}
  </section>
  {!visible.length&&<p className="research-empty">没有匹配的章节，试试「分歧」或「主线」。</p>}
  {visible.map(c=><section key={c.id} id={'method-'+c.id} className="panel handbook-chapter">
   <h2>{c.title}</h2>
   <dl>{c.entries.map(([label,text])=><div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
  </section>)}
  <p className="review-disclaimer">资料用于行情研究与复盘。案例与规则仅供参考，不构成投资建议。</p>
 </div>;
}
