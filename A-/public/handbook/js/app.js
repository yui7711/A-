/* ============================================================
   渲染引擎 + 导航 + 搜索
   ============================================================ */
(function () {
  'use strict';
  var CH = window.CHAPTERS || [];

  /* ---------- 转义辅助 ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function strip(s) { return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '); }

  /* ---------- 块渲染 ---------- */
  function renderBlock(b) {
    switch (b.t) {
      case 'p':
        return '<p class="txt">' + b.v + '</p>';

      case 'formula':
        return '<div class="formula">' + esc(b.v) + '</div>';

      case 'box': {
        var body = (b.b || []).map(function (x) { return '<p>' + x + '</p>'; }).join('');
        return '<div class="box ' + (b.k || 'info') + '"><div class="bt">' + (b.ti || '') + '</div>' + body + '</div>';
      }

      case 'table': {
        var h = '<div class="tw">' +
          (b.cap ? '<div class="tb-cap">' + b.cap + '</div>' : '') +
          '<table class="tb"><thead><tr>' +
          b.head.map(function (x) { return '<th>' + x + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          b.rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>';
        return h;
      }

      case 'kv':
        return '<div class="kv">' + b.items.map(function (it) {
          return '<div>' + it[0] + '</div><div>' + it[1] + '</div>';
        }).join('') + '</div>';

      case 'check':
        return '<div class="check">' + b.items.map(function (x, i) {
          return '<div class="ck"><span class="ck-n">' + (i + 1) + '</span><span>' + x + '</span></div>';
        }).join('') + '</div>';

      case 'tl':
        return '<div class="tl">' + b.items.map(function (x) {
          return '<div class="tl-i"><h6>' + x.t + '</h6><p>' + x.p + '</p></div>';
        }).join('') + '</div>';

      case 'flow':
        return '<div class="flow">' + b.items.map(function (x) {
          return '<div class="fnode"><div class="fn-t">' + x.t + '</div><div class="fn-s">' + x.s + '</div><div class="fn-x">' + x.x + '</div></div>';
        }).join('') + '</div>';

      case 'duo':
        return '<div class="duo">' +
          '<div class="good"><h6>' + b.good.t + '</h6><ul class="ul">' + b.good.items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
          '<div class="bad"><h6>' + b.bad.t + '</h6><ul class="ul">' + b.bad.items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
          '</div>';

      case 'case': {
        var meta = (b.meta || []).map(function (m) {
          return '<div>' + m[0] + '</div><div>' + m[1] + '</div>';
        }).join('');
        return '<div class="case-wrap">' +
          '<div class="case-h"><div class="ct">' + b.name + '</div><div class="cs">' + (b.sub || '') + '</div></div>' +
          '<div class="case-body">' +
          (meta ? '<div class="kv">' + meta + '</div>' : '') +
          (b.why ? '<div class="box key" style="margin-top:12px"><div class="bt">为什么选这个案例</div><p>' + b.why + '</p></div>' : '') +
          '</div></div>';
      }

      case 'cnodes':
        return '<div class="cnodes">' + b.items.map(function (x, i) {
          return '<div class="cnode">' +
            '<div class="cnode-h"><span class="cn-idx">' + (i + 1) + '</span>' +
            '<div class="cn-hd"><div class="cn-t">' + x.title + '</div>' +
            '<div class="cn-d">' + x.d + ' · ' + x.date + '</div></div>' +
            '<span class="tag t-' + (x.tc || 'gy') + '">' + x.tag + '</span></div>' +
            '<div class="cnode-body">' +
            '<div class="cn-row"><span class="cn-lb s1">盘面</span><span>' + x.scene + '</span></div>' +
            '<div class="cn-row"><span class="cn-lb s2">判定</span><span>' + x.judge + '</span></div>' +
            '<div class="cn-row"><span class="cn-lb s3">操作</span><span>' + x.op + '</span></div>' +
            '<div class="cn-row"><span class="cn-lb s4">结果</span><span>' + x.res + '</span></div>' +
            '</div></div>';
        }).join('') + '</div>';

      case 'stages':
        return '<div class="stages">' + b.items.map(function (s, i) {
          var tags = (s.tags || []).map(function (tg) { return '<span class="tag t-' + tg[1] + '">' + tg[0] + '</span>'; }).join('');
          var cols = (s.cols || []).map(function (c) {
            return '<div class="st-col"><h6>' + c.h + '</h6><ul>' + c.li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
          }).join('');
          var foot = (s.foot || []).map(function (f) { return '<div><b>' + f[0] + '：</b>' + f[1] + '</div>'; }).join('');
          return '<div class="stage" data-st="' + i + '">' +
            '<div class="stage-h"><span class="st-idx">' + (i + 1) + '</span>' +
            '<div><div class="st-name">' + s.n + '</div><div class="st-alias">' + (s.a || '') + '</div></div>' +
            '<div class="st-meta">' + tags + '</div></div>' +
            '<div class="st-body"><div class="st-grid">' + cols + '</div>' +
            (foot ? '<div class="st-foot">' + foot + '</div>' : '') + '</div></div>';
        }).join('') + '</div>';

      default:
        return '';
    }
  }

  /* ---------- 渲染全文 ---------- */
  function render() {
    var art = document.getElementById('article');
    var nav = document.getElementById('navList');
    var html = '', navHtml = '', gi = 0;

    CH.forEach(function (ch, ci) {
      gi++;
      var secHtml = '';
      var subHtml = '';
      ch.sections.forEach(function (sec, si) {
        secHtml += '<section class="sec" id="' + sec.id + '">' +
          '<h3>' + sec.title + (sec.en ? ' <span class="h-en">' + sec.en + '</span>' : '') + '</h3>' +
          sec.blocks.map(renderBlock).join('') +
          '</section>';
        subHtml += '<a href="#' + sec.id + '" data-sec="' + sec.id + '"><span class="nav-num">' + (si + 1) + '</span>' + sec.title.replace(/<[^>]*>/g, '') + '</a>';
      });

      html += '<article class="chapter" id="ch-' + ch.id + '">' +
        '<div class="ch-head"><div class="ch-kicker">CHAPTER ' + String(gi).padStart(2, '0') + '</div>' +
        '<h2>' + ch.icon + ' ' + ch.title + '</h2>' +
        (ch.lead ? '<p class="ch-lead">' + ch.lead + '</p>' : '') + '</div>' +
        secHtml + '</article>';

      navHtml += '<div class="nav-group' + (ci === 0 ? ' open' : '') + '" data-g="' + ch.id + '">' +
        '<div class="nav-g-title"><span>' + ch.icon + ' ' + ch.title.replace(/^[^·]*·\s*/, '') + '</span><span class="arw">▶</span></div>' +
        '<div class="nav-sub">' + subHtml + '</div></div>';
    });

    art.innerHTML = html;
    nav.innerHTML = navHtml;
    bindNav();
    bindStages();
  }

  /* ---------- 导航交互 ---------- */
  function bindNav() {
    document.querySelectorAll('.nav-g-title').forEach(function (el) {
      el.addEventListener('click', function () {
        var g = el.parentElement;
        var open = g.classList.contains('open');
        // 手风琴：同级互斥
        document.querySelectorAll('.nav-group').forEach(function (x) { x.classList.remove('open'); });
        if (!open) g.classList.add('open');
        else g.classList.add('open');
      });
    });

    document.querySelectorAll('.nav-sub a').forEach(function (a) {
      a.addEventListener('click', function () {
        document.querySelectorAll('.nav-sub a').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        if (window.innerWidth <= 820) document.getElementById('sidebar').classList.remove('on');
      });
    });
  }

  /* ---------- 阶段卡折叠 ---------- */
  function bindStages() {
    document.querySelectorAll('.stage-h').forEach(function (h) {
      h.addEventListener('click', function () {
        h.parentElement.classList.toggle('open');
      });
    });
  }

  /* ---------- 滚动高亮 ---------- */
  function initScrollSpy() {
    var secs = [].slice.call(document.querySelectorAll('section.sec'));
    var links = {};
    document.querySelectorAll('.nav-sub a').forEach(function (a) { links[a.dataset.sec] = a; });

    function onScroll() {
      var y = window.scrollY + 90, cur = null;
      secs.forEach(function (s) { if (s.offsetTop <= y) cur = s; });
      if (!cur) return;
      document.querySelectorAll('.nav-sub a').forEach(function (x) { x.classList.remove('active'); });
      if (links[cur.id]) {
        links[cur.id].classList.add('active');
        var g = links[cur.id].closest('.nav-group');
        if (g && !g.classList.contains('open')) {
          document.querySelectorAll('.nav-group').forEach(function (x) { x.classList.remove('open'); });
          g.classList.add('open');
        }
        // 侧栏自动滚动到可见
        var sb = document.getElementById('sidebar');
        var r = links[cur.id].getBoundingClientRect(), sr = sb.getBoundingClientRect();
        if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) {
          sb.scrollTop += (r.top - sr.top) - sr.height / 2;
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 搜索 ---------- */
  var INDEX = [];
  function buildIndex() {
    CH.forEach(function (ch) {
      INDEX.push({ t: ch.title, c: ch.id, s: '', txt: strip(ch.lead || ''), kind: '章节' });
      ch.sections.forEach(function (sec) {
        var txt = sec.blocks.map(function (b) {
          if (b.v) return strip(b.v);
          if (b.b) return b.b.map(strip).join(' ');
          if (b.rows) return b.rows.map(function (r) { return r.map(strip).join(' '); }).join(' ');
          if (b.why || b.meta) return strip(b.why || '') + ' ' + strip(b.name || '') + ' ' + (b.meta || []).map(function (m) { return strip(m[0] + ' ' + m[1]); }).join(' ');
          if (b.items) return b.items.map(function (it) {
            if (typeof it === 'string') return strip(it);
            if (it.t || it.p) return strip((it.t || '') + ' ' + (it.p || ''));
            if (it.scene) return strip([it.d, it.title, it.tag, it.scene, it.judge, it.op, it.res].join(' '));
            if (it.li) return it.li.map(strip).join(' ');
            if (it.cols) return strip((it.n || '') + ' ' + (it.a || ''));
            if (it.items) return it.items.map(strip).join(' ');
            if (it.good) return strip(it.good.t) + ' ' + it.good.items.map(strip).join(' ');
            return '';
          }).join(' ');
          if (b.good) return strip(b.good.t) + b.good.items.map(strip).join(' ');
          if (b.cap) return strip(b.cap);
          return '';
        }).join(' ');
        INDEX.push({
          t: sec.title.replace(/<[^>]*>/g, ''), c: ch.id, s: sec.id,
          txt: txt.slice(0, 4000), kind: '小节'
        });
      });
    });
  }

  function initSearch() {
    var inp = document.getElementById('searchInput');
    var box = document.getElementById('searchResult');
    inp.addEventListener('input', function () {
      var q = inp.value.trim();
      if (!q) { box.classList.remove('on'); return; }
      var res = INDEX.filter(function (it) {
        return it.t.indexOf(q) >= 0 || it.txt.indexOf(q) >= 0;
      }).slice(0, 18);
      if (!res.length) {
        box.innerHTML = '<div class="sr-empty">未找到「' + esc(q) + '」相关内容</div>';
      } else {
        box.innerHTML = res.map(function (r) {
          var pos = r.txt.indexOf(q);
          var sn = pos >= 0 ? r.txt.slice(Math.max(0, pos - 40), pos + 110) : r.txt.slice(0, 130);
          return '<div class="sr-item" data-sec="' + (r.s || r.c) + '">' +
            '<div class="sr-t">' + r.kind + ' · ' + hl(r.t, q) + '</div>' +
            '<div class="sr-c">' + hl(sn, q) + '</div></div>';
        }).join('');
        box.querySelectorAll('.sr-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var id = el.dataset.sec;
            var t = document.getElementById(id) || document.getElementById('ch-' + id);
            if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
            box.classList.remove('on'); inp.value = '';
          });
        });
      }
      box.classList.add('on');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-box')) box.classList.remove('on');
    });
  }
  function hl(s, q) {
    return esc(s).split(q).join('<b style="color:var(--up)">' + esc(q) + '</b>');
  }

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    render();
    buildIndex();
    initSearch();
    initScrollSpy();

    document.getElementById('btnMenu').addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('on');
    });

    // 锚点跳转补偿
    window.addEventListener('hashchange', function () {
      var id = location.hash.slice(1);
      var t = document.getElementById(id);
      if (t) setTimeout(function () { window.scrollTo({ top: t.offsetTop - 70, behavior: 'smooth' }); }, 30);
    });
  });
})();
