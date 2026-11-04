import type {Source} from './market-types';
export function sourceLabel(s:Source){
 if(s.id==='tdx')return '本机文件导入';
 if(s.availability==='standby')return '备用可用 · 自动切换';
 if(s.availability==='checking')return '检测中 · 自动切换';
 if(s.id==='fuyao'&&s.mode==='fallback'&&s.status==='missing')return '未使用 · 直连模式';
 if(s.mode==='snapshot')return '备用快照 · 原时点';
 if(s.errorCode==='auth')return 'Key 无效';
 if(s.errorCode==='permission')return '接口权限不足';
 if(s.errorCode==='rate-limit')return '接口限流 · 稍后重试';
 if(s.errorCode==='configuration')return '服务端未配置 Key';
 if(s.errorCode==='timeout')return '接口超时 · 自动重试';
 if(s.status==='error')return '连接失败 · 自动重试';
 if(s.status==='missing')return '待配置';
 if(s.status==='partial')return '缺失项待核实';
 if(s.mode==='close')return '最近交易日';
 if(s.mode==='empty')return '已连接 · 暂无记录';
 if(s.id==='em-pool')return '实时直连 · 备用通道';
 return '实时已连接';
}
