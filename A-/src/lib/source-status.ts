import type {Source} from './market-types';
export function sourceLabel(s:Source){
 if(s.id==='tdx')return '本机文件导入';
 if(s.mode==='snapshot')return '备用收盘快照';
 if(s.status==='error')return '连接失败 · 自动重试';
 if(s.status==='missing')return '待配置';
 if(s.status==='partial')return '缺失项待核实';
 if(s.mode==='close')return '最近交易日';
 if(s.mode==='empty')return '已连接 · 暂无记录';
 return '实时已连接';
}
