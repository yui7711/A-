export function SignalLegend(){
 return <div className="signal-legend" aria-label="信号颜色说明">
  <b className="focus-pill focus-priority">蓝 · 关注</b>
  <b className="focus-pill focus-positive">绿 · 可行</b>
  <b className="focus-pill focus-watch">橙 · 警告</b>
  <b className="focus-pill focus-risk">红 · 危险</b>
  <b className="focus-pill focus-muted">灰 · 数据不足</b>
 </div>;
}
