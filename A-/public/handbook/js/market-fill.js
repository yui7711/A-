(function () {
  'use strict';

  let bridge, tool, market, fields = [], picker, status, missing, sourceInfo, pickerItems;
  let following=true, historical=false, checkedAt=0, lastRequest=0;
  const period = new URLSearchParams(location.search);
  const manual = new Map();
  const selected = new Map();
  let connection = '正在读取曜石共享快照…';
  const time = value => Number.isFinite(value)
    ? new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '时点待核验';
  const current = () => market?.valid ? market : null;
  const rank = (value, limits) => value == null ? null : limits.filter(limit => value >= limit).length;
  const typed = value => value == null ? '' : String(value);
  const auto = (value, detail = '已核验行情') => ({ value, detail });
  const absent = detail => auto(null, detail);

  function request(force = false) {
    if (document.hidden || !document.getElementById('drawer').classList.contains('on')) return;
    if (!force && (!following || Date.now()-lastRequest<30000)) return;
    if (!bridge) {
      bridge = document.createElement('iframe');
      bridge.hidden = true;
      bridge.title = '曜石行情连接';
      bridge.src = '../handbook-market.html';
      document.body.append(bridge);
    } else {
      lastRequest=Date.now();
      bridge.contentWindow.postMessage({ kind: 'obsidian-handbook-request', tool, code:selected.get(tool), date:period.get('date'), slot:period.get('slot') }, location.origin);
    }
  }

  function pickItems(data) {
    if (tool === 'mainline') return (data?.themes || []).map(t => [t.name, t.name]);
    return (data?.stocks || []).map(s => [s.code, s.name + ' · ' + s.code]);
  }

  function evidence(id, data) {
    const values = data?.fields || {};
    const stock = data?.stocks.find(s => s.code === selected.get(tool));
    const theme = data?.themes.find(t => t.name === selected.get(tool));
    const prior = data?.prior;
    const priorDetail = prior?.total?'同刻报价覆盖 '+prior.coverage+'/'+prior.total+' 只 · 需完整覆盖':'缺上一交易日完整涨停名单或同刻报价';
    switch (tool) {
      case 'thermo': {
        const key = id.slice(2);
        if (key === 'vol') return absent('需要当日全市场成交额与过去五日同口径均量');
        if (key === 'upr') return absent('需要全市场上涨家数与总家数');
        if (key === 'dir') return absent('需要前三日同一温度模型的结果');
        if (key === 'prem' || key === 'damian') return auto(key==='prem'?prior?.premium:prior?.largeLoss,priorDetail);
        if (key === 'jjl') return auto(prior?.promotion==null?null:prior.promotion*100,'需两日完整涨停名单，按代码核对昨日连板股是否晋级');
        return auto(values[key], values[key] == null?'需要完整且同口径的当日池与统计':'当日涨停池或同日统计');
      }
      case 'mainline': {
        if (id === 'f_ratio') return auto(theme?.ratio, theme?.ratio == null?'选择题材并核对全市场涨停池口径':'当前题材涨停数 ÷ 同口径全市场涨停数');
        if (id === 'f_echelon' && theme?.onlyFirst) return auto(4, '当前题材涨停样本全部为首板');
        if (id === 'f_echelon' && theme?.levels?.length) {
          const levels=theme.levels, high=levels.at(-1);
          if(high<5)return auto(12,'完整涨停名单未见五板高标');
          if(levels.includes(1)&&levels.includes(2)&&levels.some(n=>n>=3&&n<high))return auto(20,'当前覆盖高标、中位、低位和首板');
          return absent('已有高标但缺其他层级，原工具无对应选项');
        }
        if (id==='f_days') return auto(theme?.daysScore,'需连续交易日的同口径题材归档');
        if (id==='f_jjl') return auto(theme?.promotion,'需昨日题材连板名单与当日完整涨停名单');
        if (id==='f_zj') return auto(theme?.middleScore,'需要行业成分、同时点成交与市值，以及同日均线量能');
        return absent('缺带时间的公告或产业事件，无法评定催化级别');
      }
      case 'diverge':
        if (id === 'dv_0' && stock && stock.boards>=2) return auto(stock.boards>=6?-1:stock.boards===5?0:1,'候选股连板高度');
        if (id === 'dv_3' && stock?.turnover != null) {
          const v = stock.turnover;
          return auto(v>=15&&v<=35?1:v>=10&&v<=45?0:-1,'候选股当日换手率 '+v+'%');
        }
        if (id==='dv_2'&&stock&&data?.volumeCode===stock.code&&data.volumeRatio>=1.5) return auto(data.volumeRatio>3?-1:data.volumeRatio>2.5?0:1,'当日成交量 ÷ 前五日均量 '+data.volumeRatio.toFixed(2)+' 倍');
        if (id==='dv_4'&&stock&&data?.role?.code===stock.code&&data.role.good[7]?.passed===true) return auto(1,data.role.good[7].detail);
        if (id==='dv_5'&&stock&&data?.role?.code===stock.code&&data.role.bad[9]?.passed===true) return auto(0,data.role.bad[9].detail);
        if (id==='dv_8'&&stock&&data?.role?.code===stock.code&&data.role.bad[7]?.passed===true) return auto(-1,data.role.bad[7].detail);
        return absent('缺原选项对应的分钟盘口、历史分歧或次日行情');
      case 'dragon': {
        const role=data?.role?.code===stock?.code?data?.role:null;
        const item=(id.startsWith('dg_')?role?.good:role?.bad)?.[Number(id.slice(3))];
        return item?auto(item.passed,item.detail):absent('等待个股同日涨停池、报价和日线自动核验');
      }
      case 'locate':
        if (id === 'lc_high') return auto(rank(values.high,[3,4,6,8]),'市场最高连板');
        if (id === 'lc_zt') return auto(values.zt==null?null:rank(values.zt,[25,40,60,86]),'当日涨停家数');
        if (id === 'lc_prem') return auto(prior?.premium==null?null:prior.premium>3?4:rank(prior.premium,[-3,0,1.5]),priorDetail);
        if (id === 'lc_damian') return auto(rank(prior?.largeLoss,[2,4,7,11]),priorDetail);
        if (id === 'lc_dragon'&&data?.role?.g>=12&&data.role.b===0&&data.role.bu===0&&data.stocks[0]?.boards===values.high&&values.high>=3) return auto(values.high===3?1:2,'同日最高标已达龙头成色门槛');
        return absent('缺已确认龙头的连续状态或主线周期证据');
      default: return absent('待核验');
    }
  }

  function save() {
    return manual.get(tool) || new Map();
  }

  function read(field) {
    return field.type === 'checkbox' ? field.checked : field.value;
  }

  function apply(field, value) {
    if (field.type === 'checkbox') {
      field.indeterminate = value == null;
      field.checked = value === true;
    } else {
      field.value = typed(value);
    }
  }

  function clearResult() {
    const result = document.getElementById('res');
    if (result) result.classList.remove('on');
  }

  function sync() {
    if (!status) return;
    const data = current();
    if (picker) {
      const entries = pickItems(data);
      const currentValue = selected.get(tool) || '';
      const signature = JSON.stringify(entries);
      if (signature!==pickerItems) {
        pickerItems = signature;
        picker.replaceChildren(new Option(tool === 'mainline'?'选择题材':'选择候选股',''),...entries.map(([key,label])=>new Option(label,key)));
      }
      const value = entries.some(([key])=>key===currentValue)?currentValue:(entries[0]?.[0]||'');
      if (picker.value!==value) picker.value = value;
      if (value!==currentValue) {
        selected.set(tool,value);
        if (value) request(true);
      }
    }
    const overrides = save();
    let filled = 0, user = 0, pending = 0;
    for (const {field, badge} of fields) {
      const provided = evidence(field.id,data);
      const fromSnapshot = provided.value!=null;
      const isManual = tool!=='dragon'&&!fromSnapshot&&overrides.has(field.id);
      const value = isManual ? overrides.get(field.id) : provided.value;
      const before = read(field);
      apply(field,value);
      if (field.tagName==='SELECT'||field.type==='checkbox') field.disabled=tool==='dragon'||fromSnapshot;
      else field.readOnly=fromSnapshot;
      if (fromSnapshot) overrides.delete(field.id);
      if (before!==read(field)) clearResult();
      const known = value!=null&&value!=='';
      badge.textContent = !known?'待核验':isManual?'手动已填':tool==='dragon'?(value?'已命中':'未命中'):'行情自动填充';
      badge.title = isManual?'刷新快照时保留手动值':known&&data?data.date+' '+data.source+' '+data.timeBasis+' '+time(data.time)+' · '+provided.detail:provided.detail;
      badge.setAttribute('aria-label',badge.textContent+'，'+badge.title);
      badge.dataset.state = !known?'missing':isManual?'manual':'auto';
      field.dataset.missing = known?'false':'true';
      if(field.tagName==='INPUT'&&field.type!=='checkbox')field.placeholder = known?'':'待核验';
      badge.textContent += !known?' · '+provided.detail:'';
      if (!known) pending++;
      else if (isManual) user++;
      else filled++;
    }
    sourceInfo.textContent = data ? data.date+' · '+data.source+' · '+data.timeBasis+' '+time(data.time)
      +(historical?' · 最近可用历史快照':'')+(checkedAt?' · 检查 '+time(checkedAt):'')+(connection?' · '+connection:'') : connection;
    const role=tool==='dragon'&&data?.role?.code===selected.get(tool)?data?.role:null;
    status.textContent = role?role.leader+' · '+role.g+'/17 命中 · '+role.top+' · '+role.b+'/12 命中 · '+pending+' 项待核验'
      :'自动 '+filled+' 项 · 手动 '+user+' 项 · 待核验 '+pending+' 项';
    if (!pending) missing.textContent = '';
  }

  function setup(id) {
    tool = id;
    const body = document.getElementById('drawerBody');
    const toolbar = document.createElement('div');
    toolbar.className = 'market-fill-controls';
    toolbar.innerHTML = '<p data-market-source></p><p role="status" data-market-status></p><div class="market-fill-actions"></div><p role="alert" data-market-missing></p>';
    body.prepend(toolbar);
    sourceInfo = toolbar.querySelector('[data-market-source]');
    status = toolbar.querySelector('[data-market-status]');
    missing = toolbar.querySelector('[data-market-missing]');
    const actions = toolbar.querySelector('.market-fill-actions');
    const button = (label, action) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'btn-ghost';
      node.textContent = label;
      node.addEventListener('click',action);
      actions.append(node);
    };
    picker = null;
    pickerItems = null;
    if (['mainline','diverge','dragon'].includes(tool)) {
      picker = document.createElement('select');
      picker.setAttribute('aria-label',tool==='mainline'?'选择自动填充题材':'选择自动填充候选股');
      picker.addEventListener('change',()=>{
        selected.set(tool,picker.value);
        manual.delete(tool);
        clearResult();
        sync();
        request(true);
      });
      actions.append(picker);
    }
    const followLabel=document.createElement('label');
    const followInput=document.createElement('input');
    followInput.type='checkbox';
    followInput.checked=following;
    followInput.addEventListener('change',()=>{
      following=followInput.checked;
      if(following)request(true);
    });
    followLabel.append(followInput,' 自动跟随最新快照');
    actions.append(followLabel);
    button('立即检查快照',()=>{
      connection='正在检查最新快照…';
      sync();
      request(true);
    });
    if(tool!=='dragon')button('重置手动值',()=>{manual.delete(tool);clearResult();sync();});
    const formFields = [...body.querySelectorAll('input[id], select[id]')];
    fields = formFields.map(field=>{
      if (field.tagName==='SELECT') field.prepend(new Option('待核验',''));
      const badge = document.createElement('small');
      badge.className = 'market-field-badge';
      field.parentElement.append(badge);
      field.addEventListener('input',()=>{
        const overrides = save();
        overrides.set(field.id,read(field));
        manual.set(tool,overrides);
        clearResult();
        sync();
      });
      return {field,badge};
    });
    const calculate=body.querySelector('#btnRun');
    calculate.addEventListener('click',event=>{
      sync();
      const incomplete = fields.filter(({field})=>field.dataset.missing==='true'||field.type==='number'&&!Number.isFinite(field.valueAsNumber));
      if (!incomplete.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearResult();
      missing.textContent = '还有 '+incomplete.length+' 项待核验。当前已核验结果见上方，证据齐备后显示完整判定。';
      incomplete[0].field.focus();
    },true);
    sync();
    calculate.disabled=false;
    request(true);
  }

  window.addEventListener('message',event=>{
    if (event.origin!==location.origin||event.source!==bridge?.contentWindow||event.data?.kind!=='obsidian-handbook-market') return;
    const {ready,error,market:next}=event.data;
    if (ready) { request(true); return; }
    if (next) {
      if (market?.date && next.date && market.date!==next.date && next.valid) {
        manual.clear();
        selected.clear();
        clearResult();
      }
      const sameSnapshot=market?.date===next.date&&market.source===next.source&&market.time===next.time;
      market = sameSnapshot?{...market,...next}:next;
      historical=event.data.historical===true;
      checkedAt=event.data.checkedAt||0;
      connection = '';
    } else if (error) {
      connection = error;
    }
    sync();
    if(next?.prior&&fields.length&&fields.every(({field})=>field.dataset.missing==='false')) {
      document.getElementById('btnRun')?.click();
    }
  });
  document.addEventListener('obsidian:handbook-tool',event=>setup(event.detail));
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden) {sync();request();} });
  setInterval(()=>{ if (tool&&!document.hidden) request(); },5000);
})();
