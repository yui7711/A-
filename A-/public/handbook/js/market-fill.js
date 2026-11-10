(function () {
  'use strict';

  let bridge, tool, market, fields = [], picker, status, missing, sourceInfo, pickerItems;
  const manual = new Map();
  const selected = new Map();
  const maxAge = 45000;
  let receivedAt = 0;
  let connection = '正在连接曜石行情…';
  const time = value => Number.isFinite(value)
    ? new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '时点待核验';
  const current = () => market?.valid && Date.now() - receivedAt <= maxAge ? market : null;
  const rank = (value, limits) => value == null ? null : limits.filter(limit => value >= limit).length;
  const typed = value => value == null ? '' : String(value);
  const auto = (value, detail = '已核验行情') => ({ value, detail });
  const absent = detail => auto(null, detail);

  function request(force = false) {
    if (document.hidden || !document.getElementById('drawer').classList.contains('on')) return;
    if (!bridge) {
      bridge = document.createElement('iframe');
      bridge.hidden = true;
      bridge.title = '曜石行情连接';
      bridge.src = '../handbook-market.html';
      document.body.append(bridge);
    } else {
      bridge.contentWindow.postMessage({ kind: 'obsidian-handbook-request', force }, location.origin);
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
    switch (tool) {
      case 'thermo': {
        const key = id.slice(2);
        if (key === 'vol') return absent('需要当日全市场成交额与过去五日同口径均量');
        if (key === 'upr') return absent('需要全市场上涨家数与总家数');
        if (key === 'dir') return absent('需要前三日同一温度模型的结果');
        if (key === 'prem' || key === 'damian') {
          return auto(values[key], values[key] == null?'需要上一交易日完整涨停池及所有样本的当日报价':'上一交易日涨停池与当日报价');
        }
        if (key === 'jjl') return auto(values.jjl, values.jjl == null?'需要两日完整名单及上一交易日连板样本':'按上一交易日二板及以上样本逐股核对晋级');
        return auto(values[key], values[key] == null?'需要完整且同口径的当日池与统计':'当日涨停池或同日统计');
      }
      case 'mainline':
        if (id === 'f_ratio') return auto(theme?.ratio, theme?.ratio == null?'选择题材并核对全市场涨停池口径':'当前题材涨停数 ÷ 同口径全市场涨停数');
        if (id === 'f_echelon' && theme?.onlyFirst) return auto(4, '当前题材涨停样本全部为首板');
        return absent('请核验题材的历史、梯队、中军或催化信息');
      case 'diverge':
        if (id === 'dv_0' && stock && stock.boards>=2) return auto(stock.boards>=6?-1:stock.boards===5?0:1,'候选股连板高度');
        if (id === 'dv_3' && stock?.turnover != null) {
          const v = stock.turnover;
          return auto(v>=15&&v<=35?1:v>=10&&v<=45?0:-1,'候选股当日换手率 '+v+'%');
        }
        return absent('请根据原选项核验分歧证据');
      case 'dragon':
        if (id === 'dg_0' && stock && values.high != null && stock.boards===values.high) return auto(true,'与全市场最高板同高');
        if (id === 'dg_5' && stock) return auto(stock.boards>=3,'当前 '+stock.boards+' 板');
        if (id === 'dg_6' && stock?.turnover != null) return auto(stock.turnover>=15&&stock.turnover<=35,'当前换手率 '+stock.turnover+'%');
        return absent('请核验该项是否命中');
      case 'locate':
        if (id === 'lc_high') return auto(rank(values.high,[3,4,6,8]),'市场最高连板');
        if (id === 'lc_zt') return auto(values.zt==null?null:rank(values.zt,[25,40,60,86]),'当日涨停家数');
        if (id === 'lc_prem') return auto(values.prem==null?null:values.prem>3?4:rank(values.prem,[-3,0,1.5]),'上一交易日涨停股当日报价');
        if (id === 'lc_damian') return auto(rank(values.damian,[2,4,7,11]),'上一交易日涨停股当日报价');
        return absent('请按原选项核验龙头或板块状态');
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
      const value = entries.some(([key])=>key===currentValue)?currentValue:'';
      if (picker.value!==value) picker.value = value;
    }
    const overrides = save();
    let filled = 0, user = 0, pending = 0;
    for (const {field, badge} of fields) {
      const provided = evidence(field.id,data);
      const isManual = overrides.has(field.id);
      const value = isManual ? overrides.get(field.id) : provided.value;
      const before = read(field);
      apply(field,value);
      if (before!==read(field)) clearResult();
      const known = value!=null&&value!=='';
      badge.textContent = !known?'待手动补充':isManual?'手动已填':'自动填充';
      badge.title = isManual?'保留手动值，行情刷新时不覆盖':provided.detail;
      badge.setAttribute('aria-label',badge.textContent+'，'+badge.title);
      badge.dataset.state = !known?'missing':isManual?'manual':'auto';
      field.dataset.missing = known?'false':'true';
      if (!known) pending++;
      else if (isManual) user++;
      else filled++;
    }
    sourceInfo.textContent = data ? data.date+' · '+data.source+' · '+data.timeBasis+' '+time(data.time) : connection;
    status.textContent = '自动 '+filled+' 项 · 手动 '+user+' 项 · 待补 '+pending+' 项';
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
      });
      actions.append(picker);
    }
    button('刷新行情',()=>request(true));
    button('重置手动值',()=>{manual.delete(tool);clearResult();sync();});
    const formFields = [...body.querySelectorAll('input[id], select[id]')];
    fields = formFields.map(field=>{
      if (field.tagName==='SELECT') field.prepend(new Option('请选择',''));
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
    if (tool==='dragon') button('确认其余待核验项未命中',()=>{
      const overrides = save();
      for (const {field} of fields) if (field.indeterminate) overrides.set(field.id,false);
      manual.set(tool,overrides);
      clearResult();
      sync();
    });
    body.querySelector('#btnRun').addEventListener('click',event=>{
      sync();
      const incomplete = fields.filter(({field})=>field.dataset.missing==='true'||field.type==='number'&&!Number.isFinite(field.valueAsNumber));
      if (!incomplete.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearResult();
      missing.textContent = '还有 '+incomplete.length+' 项未填写或数值无效。补齐后按原版规则计算。';
      incomplete[0].field.focus();
    },true);
    sync();
    request();
  }

  window.addEventListener('message',event=>{
    if (event.origin!==location.origin||event.source!==bridge?.contentWindow||event.data?.kind!=='obsidian-handbook-market') return;
    const {ready,error,market:next}=event.data;
    if (ready) { request(); return; }
    if (next) {
      if (market?.date && next.date && market.date!==next.date && next.valid) {
        manual.clear();
        selected.clear();
        clearResult();
      }
      market = next;
      receivedAt = Date.now();
      connection = next.issue||'等待有效行情';
    } else if (error) {
      connection = error;
    }
    sync();
  });
  document.addEventListener('obsidian:handbook-tool',event=>setup(event.detail));
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden) {sync();request();} });
  setInterval(()=>{ if (tool&&!document.hidden) {sync();request();} },5000);
})();
