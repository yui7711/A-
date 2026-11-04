'use client';
import {useState} from 'react';
import {KeyRound,Link2,ShieldCheck} from 'lucide-react';
import {enableFuyaoDirect,disableFuyaoDirect,hasFuyaoDirect} from '@/lib/fuyao-direct';
export default function FuyaoConnection({onChange}:{onChange:()=>void}){
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[active,setActive]=useState(hasFuyaoDirect),[message,setMessage]=useState(''),[error,setError]=useState('');
 const connect=async()=>{setBusy(true);setError('');try{const v=await enableFuyaoDirect(draft);setDraft('');setActive(true);setMessage('Key 鉴权通过 · '+new Date(v.checkedAt).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}));onChange();}catch(e){setError(e instanceof Error?e.message:'本页直连验证失败');}finally{setBusy(false);}};
 return <section className="panel fuyao-connection" aria-label="同花顺本页直连"><div className="fuyao-connect-heading"><span><Link2 size={19}/></span><div><h2>同花顺连接 · 本页直连备用</h2><p>转发服务被网络拦截时，直接连接 fuyao.aicubes.cn；与东方财富 / 腾讯继续自动切换。</p></div><b className={'focus-pill focus-'+(active?'positive':'muted')}>{active?'本页已启用':'可启用备用连接'}</b></div>
 <div className="fuyao-key-form"><label><KeyRound size={15}/><input type="password" autoComplete="off" spellCheck={false} aria-label="同花顺 API Key（仅本页会话）" placeholder="输入 API Key，验证后启用本页直连" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&draft&&!busy)void connect();}}/></label><button className="primary-btn" disabled={!draft||busy} onClick={()=>void connect()}>{busy?'验证接口中…':active?'验证并更新':'验证并启用本页直连'}</button>{active&&<button className="secondary-btn" onClick={()=>{disableFuyaoDirect();setActive(false);setMessage('已关闭本页直连，恢复服务端自动检测。');onChange();}}>关闭直连</button>}</div>
 <p className="fuyao-key-boundary"><ShieldCheck size={13}/>Key 只在当前页面内存中使用，仅发给同花顺接口；不上传 GitHub、不写入浏览器存储。重新载入或换电脑后需重新启用。</p>
 {message&&<p className="fuyao-connect-result focus-positive" role="status">{message}；完整行情状态见下方来源卡片。</p>}{error&&<p className="fuyao-connect-result focus-risk" role="alert">{error}</p>}
 </section>;
}
