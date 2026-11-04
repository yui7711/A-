export type ProviderErrorCode='auth'|'permission'|'rate-limit'|'timeout'|'network'|'http'|'configuration'|'invalid-response';
export function providerFailure(error:unknown):{errorCode:ProviderErrorCode;message:string}{
 const e=error as {providerCode?:number;status?:number;name?:string;configuration?:boolean}|null;
 if(e?.configuration)return {errorCode:'configuration',message:'服务端未配置同花顺 Key'};
 if(e?.providerCode===2001)return {errorCode:'auth',message:'同花顺鉴权失败（2001）：Key 缺失或无效'};
 if(e?.providerCode===2003)return {errorCode:'permission',message:'同花顺权限不足（2003）：当前 Key 未获该接口授权'};
 if(e?.status===429||e?.providerCode===4001)return {errorCode:'rate-limit',message:'同花顺触发限流，稍后自动重试；不代表 Key 失效'};
 if(e?.name==='AbortError'||e?.name==='TimeoutError')return {errorCode:'timeout',message:'同花顺接口请求超时，尚不能判断 Key 是否有效'};
 if(e?.status)return {errorCode:'http',message:`上游 HTTP ${e.status}，尚不能判断 Key 是否有效`};
 if(e?.name==='TypeError')return {errorCode:'network',message:'服务端未能连通同花顺接口，尚不能判断 Key 是否有效'};
 return {errorCode:'invalid-response',message:'上游未返回有效行情，尚不能判断 Key 是否有效'};
}
