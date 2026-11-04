export function connectionHint(error:unknown){
 const e=error as {status?:number;name?:string;message?:string}|null;
 if(e?.status===401||e?.status===403)return `网站服务端访问受限（HTTP ${e.status}），不代表同花顺 Key 失效`;
 if(e?.status===429)return '网站服务端限流（HTTP 429），稍后自动重连';
 if(e?.status)return `网站服务端响应异常（HTTP ${e.status}），尚未验证同花顺 Key 状态`;
 if(e?.name==='AbortError'||e?.name==='TimeoutError'||e?.message?.includes('超时'))return '网站服务端连接超时，尚未验证同花顺 Key 状态';
 if(e?.name==='TypeError')return '浏览器未能连通网站服务端，可能是网络或跨域拦截；尚未验证同花顺 Key 状态';
 return '网站服务端未返回有效行情，尚未验证同花顺 Key 状态';
}
