/* ==========================================================================
   app.js —— 简历编辑器主逻辑
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var val = function (s) { return s === undefined || s === null ? '' : String(s); };

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function toast(msg, type) {
    var wrap = $('#toastWrap');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s'; el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, type === 'err' ? 4200 : 2400);
  }

  var A4_HEIGHT = 1122.5;   // A4 高（CSS px）
  var A4_WIDTH = 794;

  var App = {
    rid: null,
    resume: null,
    zoom: 1,
    autoFit: true,
    showGuides: true,
    dirty: false,
    undoStack: [],
    redoStack: [],
    selectedSection: null,
    list: []
  };
  window.__APP__ = App;

  /* ------------------------------------------------------------ 服务端 */
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (e) {
          throw new Error(e.detail || ('请求失败 ' + r.status));
        });
      }
      return r.json();
    });
  }

  /* ------------------------------------------------------------ 渲染 */
  function renderPreview() {
    if (!App.resume) return;
    var paper = $('#paper');
    window.ResumeRenderer.render(paper, App.resume, { editable: true });
    updateGuides();
    applyZoom();
  }

  function paperSize() {
    var paper = $('#paper');
    return { width: paper.offsetWidth || A4_WIDTH, height: paper.offsetHeight || A4_HEIGHT };
  }

  function pageCount() {
    var paper = $('#paper');
    var padY = (App.resume.theme && App.resume.theme.padY) || 28;
    var content = paper.offsetHeight - padY * 2;
    var perPage = A4_HEIGHT - padY * 2;
    return Math.max(1, Math.ceil(content / perPage));
  }

  function updateGuides() {
    var guides = $('#guides');
    var paper = $('#paper');
    guides.innerHTML = '';
    var padY = (App.resume.theme && App.resume.theme.padY) || 28;
    var pages = pageCount();
    $('#pageCount').textContent = '共 ' + pages + ' 页';
    guides.style.height = paper.offsetHeight + 'px';
    var perPage = A4_HEIGHT - padY * 2;
    if (App.showGuides) {
      for (var k = 1; k < pages; k++) {
        var line = document.createElement('div');
        line.className = 'guide-line';
        line.style.top = (padY + k * perPage) + 'px';
        var lab = document.createElement('span');
        lab.textContent = '第 ' + (k + 1) + ' 页';
        line.appendChild(lab);
        guides.appendChild(line);
      }
    }
  }

  function applyZoom() {
    var size = paperSize();
    var wrap = $('#paperWrap');
    var inner = $('#previewInner');
    wrap.style.transform = 'scale(' + App.zoom + ')';
    inner.style.width = (size.width * App.zoom) + 'px';
    inner.style.height = (size.height * App.zoom) + 'px';
    $('#zoomLabel').textContent = Math.round(App.zoom * 100) + '%';
  }

  function fitZoom() {
    var scroll = $('#previewScroll');
    var avail = scroll.clientWidth - 56;
    var z = Math.min(1.6, Math.max(0.35, avail / A4_WIDTH));
    App.zoom = Math.round(z * 100) / 100;
    applyZoom();
  }

  /* ------------------------------------------------------ 左侧：基本信息 */
  function basicsPanel() {
    var b = App.resume.basics = App.resume.basics || { info: [] };
    var info = b.info = b.info || [];
    var html = [];
    html.push('<div class="field"><label>姓名</label><input class="grow" type="text" data-bind="basics.name" value="' + esc(b.name) + '"></div>');
    html.push('<div class="field"><label>头像</label>' +
      '<button class="btn mini" data-act="upload-avatar">上传图片</button>' +
      '<button class="btn mini" data-act="remove-avatar">移除</button>' +
      '<label class="check"><input type="checkbox" data-bind="basics.showPhoto" data-kind="bool"' + (b.showPhoto === false ? '' : ' checked') + '> 显示</label>' +
      '</div>');
    html.push('<div class="sub-title">信息项（手机 / 邮箱 / 性别 …）<span class="hint">取消勾选即可隐藏</span></div>');
    info.forEach(function (it, i) {
      html.push('<div class="info-row">' +
        '<input class="lb" type="text" data-bind="basics.info.' + i + '.label" value="' + esc(it.label) + '" placeholder="标签">' +
        '<input class="vl" type="text" data-bind="basics.info.' + i + '.value" value="' + esc(it.value) + '" placeholder="内容">' +
        '<label class="check" title="显示/隐藏"><input type="checkbox" data-bind="basics.info.' + i + '.visible" data-kind="bool"' + (it.visible === false ? '' : ' checked') + '></label>' +
        '<div class="row-tools">' +
        '<button class="btn mini" data-act="info-up" data-index="' + i + '" title="上移">↑</button>' +
        '<button class="btn mini" data-act="info-down" data-index="' + i + '" title="下移">↓</button>' +
        '<button class="btn mini" data-act="info-del" data-index="' + i + '" title="删除">✕</button>' +
        '</div></div>');
    });
    html.push('<div class="add-row"><button class="btn mini" data-act="info-add">+ 添加信息项</button></div>');
    return html.join('');
  }

  /* -------------------------------------------------- 左侧：条目编辑块 */
  function itemTools(path) {
    return '<div class="row-tools">' +
      '<button class="btn mini" data-act="item-up" data-path="' + path + '" title="上移">↑</button>' +
      '<button class="btn mini" data-act="item-down" data-path="' + path + '" title="下移">↓</button>' +
      '<button class="btn mini" data-act="item-copy" data-path="' + path + '" title="复制">⧉</button>' +
      '<button class="btn mini" data-act="item-del" data-path="' + path + '" title="删除">✕</button>' +
      '</div>';
  }

  function itemEditor(item, path) {
    var type = item.type || 'text';
    var out = [];
    if (type === 'entry') {
      out.push('<div class="item-card t-entry">');
      out.push('<div class="item-head"><span class="badge entry">经历条目</span><div class="spacer"></div>' + itemTools(path) + '</div>');
      out.push('<div class="grid2">');
      out.push('<div class="time-wrap">' +
        '<input type="text" data-bind="' + path + '.time" value="' + esc(item.time) + '" placeholder="时间 2022.09-2026.06">' +
        '<button class="btn mini" data-act="dp-toggle" data-path="' + path + '" title="选择日期">日期</button>' +
        '</div>');
      out.push('<input type="text" data-bind="' + path + '.title" value="' + esc(item.title) + '" placeholder="名称（学校/公司/项目）">');
      out.push('<input type="text" data-bind="' + path + '.mid" value="' + esc(item.mid) + '" placeholder="中间栏 如：本科">');
      out.push('<input type="text" data-bind="' + path + '.right" value="' + esc(item.right) + '" placeholder="右侧 如：后端开发">');
      out.push('</div>');
      out.push('<div class="dp" data-dp="' + path + '" hidden>' +
        '<input type="month" class="dp-a"> <span class="dp-sep">至</span> <input type="month" class="dp-b">' +
        '<label class="check"><input type="checkbox" class="dp-now"> 至今</label>' +
        '<button class="btn mini primary" data-act="dp-apply" data-path="' + path + '">确定</button>' +
        '</div>');
      var details = item.details = item.details || [];
      out.push('<div class="sub-title">条目内容</div><div class="details">');
      details.forEach(function (d, i) {
        out.push(itemEditor(d, path + '.details.' + i));
      });
      out.push('</div>');
      out.push('<div class="add-row">' +
        '<button class="btn mini" data-act="add-text" data-path="' + path + '.details">+ 文本</button>' +
        '<button class="btn mini" data-act="add-list" data-path="' + path + '.details">+ 列表项</button>' +
        '<button class="btn mini" data-act="add-blank" data-path="' + path + '.details">+ 空行</button>' +
        '</div>');
      out.push('</div>');
      return out.join('');
    }

    if (type === 'blank') {
      out.push('<div class="item-card t-blank"><div class="item-head"><span class="badge">空行</span><div class="spacer"></div>' + itemTools(path) + '</div></div>');
      return out.join('');
    }

    if (type === 'list') {
      var marker = item.marker === undefined ? '+' : item.marker;
      var opts = [['auto', '自动编号 1. 2. 3.'], ['+', '加号 +'], ['•', '圆点 •'], ['-', '短横 -'], ['', '无符号']];
      out.push('<div class="item-card t-list">');
      out.push('<div class="item-head"><span class="badge list">列表项</span>' +
        '<select data-bind="' + path + '.marker" style="width:auto">' +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(marker) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
        '</select><div class="spacer"></div>' + itemTools(path) + '</div>');
      out.push('<textarea data-bind="' + path + '.value" placeholder="内容">' + esc(item.value) + '</textarea>');
      out.push('</div>');
      return out.join('');
    }

    out.push('<div class="item-card t-text">');
    out.push('<div class="item-head"><span class="badge text">文本</span>' +
      '<input type="text" data-bind="' + path + '.label" value="' + esc(item.label) + '" placeholder="标签，如：项目描述（可留空）" style="width:auto;flex:1 1 auto">' +
      '<div class="spacer"></div>' + itemTools(path) + '</div>');
    out.push('<textarea data-bind="' + path + '.value" placeholder="内容">' + esc(item.value) + '</textarea>');
    out.push('</div>');
    return out.join('');
  }

  /* ------------------------------------------------------ 左侧：模块列表 */
  function sectionsPanel() {
    var sections = App.resume.sections = App.resume.sections || [];
    var html = [];
    sections.forEach(function (sec, i) {
      var items = sec.items = sec.items || [];
      html.push('<div class="section-card' + (App.selectedSection === i ? ' is-selected' : '') + '" draggable="true" data-index="' + i + '">');
      html.push('<div class="section-head">' +
        '<span class="handle" title="拖拽排序">⠿</span>' +
        '<input class="title-input" type="text" data-bind="sections.' + i + '.title" value="' + esc(sec.title) + '">' +
        '<label class="check" title="显示/隐藏"><input type="checkbox" data-bind="sections.' + i + '.visible" data-kind="bool"' + (sec.visible === false ? '' : ' checked') + '></label>' +
        '<div class="row-tools">' +
        '<button class="btn mini" data-act="sec-up" data-index="' + i + '" title="上移">↑</button>' +
        '<button class="btn mini" data-act="sec-down" data-index="' + i + '" title="下移">↓</button>' +
        '<button class="btn mini" data-act="sec-copy" data-index="' + i + '" title="复制模块">⧉</button>' +
        '<button class="btn mini" data-act="sec-del" data-index="' + i + '" title="删除模块">✕</button>' +
        '</div></div>');
      html.push('<div class="section-body">');
      items.forEach(function (it, j) {
        html.push(itemEditor(it, 'sections.' + i + '.items.' + j));
      });
      if (!items.length) html.push('<div class="hint">该模块还没有内容，用下面的按钮添加。</div>');
      html.push('<div class="add-row">' +
        '<button class="btn mini" data-act="add-entry" data-path="sections.' + i + '.items">+ 经历条目</button>' +
        '<button class="btn mini" data-act="add-text" data-path="sections.' + i + '.items">+ 文本</button>' +
        '<button class="btn mini" data-act="add-list" data-path="sections.' + i + '.items">+ 列表项</button>' +
        '<button class="btn mini" data-act="add-blank" data-path="sections.' + i + '.items">+ 空行</button>' +
        '</div>');
      html.push('</div></div>');
    });
    html.push('<div class="add-row"><button class="btn mini primary" data-act="sec-add">+ 添加模块</button>' +
      '<select id="presetSelect" class="select" style="max-width:150px">' +
      ['教育经历', '工作经历', '实习经历', '项目经历', '校园经历', '个人技能', '荣誉奖项', '证书', '自我评价', '兴趣爱好']
        .map(function (n) { return '<option>' + n + '</option>'; }).join('') +
      '</select></div>');
    return html.join('');
  }

  /* ------------------------------------------------------ 左侧：样式面板 */
  function themePanel() {
    var t = App.resume.theme = App.resume.theme || {};
    var fonts = [['Microsoft YaHei', '微软雅黑'], ['SimSun', '宋体'], ['SimHei', '黑体'],
      ['DengXian', '等线'], ['KaiTi', '楷体'], ['FangSong', '仿宋'], ['Arial', 'Arial']];
    function num(key, label, step, min, max) {
      return '<div class="field"><label>' + label + '</label><input class="grow" type="number" step="' + step + '" min="' + min + '" max="' + max +
        '" data-bind="theme.' + key + '" data-kind="number" value="' + esc(t[key]) + '"></div>';
    }
    function color(key, label) {
      return '<div class="field"><label>' + label + '</label><input type="color" class="grow" data-bind="theme.' + key + '" value="' + esc(t[key] || '#000000') + '" style="height:28px;padding:2px"></div>';
    }
    var html = [];
    html.push('<div class="field"><label>字体</label><select class="grow" data-bind="theme.fontFamily">' +
      fonts.map(function (f) { return '<option value="' + f[0] + '"' + (t.fontFamily === f[0] ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') +
      '</select></div>');
    html.push(num('fontSize', '正文字号', 0.5, 9, 20));
    html.push(num('lineHeight', '行高', 1, 12, 34));
    html.push(num('nameSize', '姓名号', 1, 16, 48));
    html.push(num('titleSize', '模块标题号', 1, 11, 30));
    html.push(num('infoSize', '信息字号', 1, 9, 24));
    html.push(num('padX', '左右边距', 1, 16, 90));
    html.push(num('padY', '上下边距', 1, 8, 80));
    html.push(num('sectionGap', '模块间距', 1, 0, 60));
    html.push(num('bodyGap', '标题下间距', 1, 0, 40));
    html.push('<div class="field"><label>名称对齐</label><select class="grow" data-bind="theme.entryAlign">' +
      '<option value="left"' + (t.entryAlign === 'center' ? '' : ' selected') + '>左对齐（与模板一致）</option>' +
      '<option value="center"' + (t.entryAlign === 'center' ? ' selected' : '') + '>居中</option></select></div>');
    html.push(num('photoWidth', '头像宽', 1, 40, 260));
    html.push(num('photoHeight', '头像高', 1, 40, 320));
    html.push(color('textColor', '文字颜色'));
    html.push(color('ruleColor', '分隔线颜色'));
    html.push('<div class="add-row"><button class="btn mini" data-act="theme-reset">恢复默认版式</button></div>');
    return html.join('');
  }

  function renderSidebar() {
    $('#basicsBody').innerHTML = basicsPanel();
    $('#sectionsBody').innerHTML = sectionsPanel();
    $('#themeBody').innerHTML = themePanel();
  }

  function renderTopbar() {
    var sel = $('#resumeSelect');
    sel.innerHTML = App.list.map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === App.rid ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    }).join('');
    $('#saveState').textContent = App.dirty ? '未保存…' : '已保存';
    $('#saveState').className = 'save-state' + (App.dirty ? ' dirty' : '');
  }

  function renderAll() {
    renderPreview();
    renderSidebar();
    renderTopbar();
  }

  /* ------------------------------------------------------------ 保存 */
  function markDirty() {
    App.dirty = true;
    renderTopbar();
    saveSoon();
  }

  var saveSoon = debounce(function () { save(); }, 1200);

  function save() {
    if (!App.rid || !App.resume) return Promise.resolve();
    try { localStorage.setItem('resume.draft.' + App.rid, JSON.stringify(App.resume)); } catch (e) { }
    return api('/api/resume/' + App.rid, { method: 'PUT', body: App.resume }).then(function (data) {
      App.dirty = false;
      renderTopbar();
      return data;
    }).catch(function (err) {
      toast('保存失败：' + err.message, 'err');
    });
  }

  /* ------------------------------------------------------------ 撤销 */
  function pushUndo() {
    if (!App.resume) return;
    App.undoStack.push(clone(App.resume));
    if (App.undoStack.length > 80) App.undoStack.shift();
    App.redoStack.length = 0;
  }

  function undo() {
    if (!App.undoStack.length) { toast('没有可撤销的操作'); return; }
    App.redoStack.push(clone(App.resume));
    App.resume = App.undoStack.pop();
    renderAll();
    markDirty();
  }

  function redo() {
    if (!App.redoStack.length) { toast('没有可重做的操作'); return; }
    App.undoStack.push(clone(App.resume));
    App.resume = App.redoStack.pop();
    renderAll();
    markDirty();
  }

  /* ------------------------------------------------------------ 数据操作 */
  function getByPath(p) { return window.ResumeRenderer.getByPath(App.resume, p); }
  function setByPath(p, v) { return window.ResumeRenderer.setByPath(App.resume, p, v); }

  function arrayAt(path) {
    var parts = String(path).split('.');
    var idx = parseInt(parts.pop(), 10);
    var arr = window.ResumeRenderer.getByPath(App.resume, parts.join('.'));
    return { arr: arr, idx: idx, parent: parts.join('.') };
  }

  function moveItem(path, delta) {
    var info = arrayAt(path);
    if (!info.arr) return;
    var j = info.idx + delta;
    if (j < 0 || j >= info.arr.length) return;
    pushUndo();
    var tmp = info.arr[info.idx];
    info.arr[info.idx] = info.arr[j];
    info.arr[j] = tmp;
    renderAll();
    markDirty();
  }

  function removeItem(path) {
    var info = arrayAt(path);
    if (!info.arr) return;
    pushUndo();
    info.arr.splice(info.idx, 1);
    renderAll();
    markDirty();
  }

  function copyItem(path) {
    var info = arrayAt(path);
    if (!info.arr) return;
    pushUndo();
    info.arr.splice(info.idx + 1, 0, clone(info.arr[info.idx]));
    renderAll();
    markDirty();
  }

  function newItem(type) {
    if (type === 'entry') return { type: 'entry', time: '', title: '', mid: '', right: '', details: [] };
    if (type === 'list') return { type: 'list', marker: '+', value: '' };
    if (type === 'blank') return { type: 'blank' };
    return { type: 'text', label: '', value: '' };
  }

  function addItem(path, type) {
    var arr = getByPath(path);
    if (!arr || !arr.push) return;
    pushUndo();
    arr.push(newItem(type));
    renderAll();
    markDirty();
  }

  function addSection(title) {
    pushUndo();
    var sections = App.resume.sections = App.resume.sections || [];
    sections.push({
      id: 'sec' + Date.now().toString(36),
      title: title || '新模块',
      visible: true,
      items: [newItem('text')]
    });
    App.selectedSection = sections.length - 1;
    renderAll();
    markDirty();
  }

  function moveSection(index, delta) {
    var sections = App.resume.sections;
    var j = index + delta;
    if (j < 0 || j >= sections.length) return;
    pushUndo();
    var tmp = sections[index];
    sections[index] = sections[j];
    sections[j] = tmp;
    App.selectedSection = j;
    renderAll();
    markDirty();
  }

  /* ------------------------------------------------------ 左侧面板事件 */
  function bindSidebar() {
    var sidebar = $('#sidebar');

    sidebar.addEventListener('input', function (e) {
      var target = e.target;
      var path = target.getAttribute && target.getAttribute('data-bind');
      if (!path) return;
      var kind = target.getAttribute('data-kind');
      var v = target.value;
      if (kind === 'number') v = v === '' ? 0 : parseFloat(v);
      setByPath(path, v);
      renderPreview();
      markDirty();
    });

    sidebar.addEventListener('change', function (e) {
      var target = e.target;
      var path = target.getAttribute && target.getAttribute('data-bind');
      if (!path) return;
      if (target.getAttribute('data-kind') === 'bool') {
        setByPath(path, target.checked);
        renderAll();
        markDirty();
      }
    });

    sidebar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var path = btn.getAttribute('data-path');
      var index = parseInt(btn.getAttribute('data-index'), 10);
      var b = App.resume.basics;

      if (act === 'info-add') { pushUndo(); b.info.push({ label: '标签', value: '', visible: true }); renderAll(); markDirty(); }
      else if (act === 'info-del') { pushUndo(); b.info.splice(index, 1); renderAll(); markDirty(); }
      else if (act === 'info-up' && index > 0) { pushUndo(); var t = b.info[index]; b.info[index] = b.info[index - 1]; b.info[index - 1] = t; renderAll(); markDirty(); }
      else if (act === 'info-down' && index < b.info.length - 1) { pushUndo(); var t2 = b.info[index]; b.info[index] = b.info[index + 1]; b.info[index + 1] = t2; renderAll(); markDirty(); }
      else if (act === 'upload-avatar') { $('#fileAvatar').click(); }
      else if (act === 'remove-avatar') { pushUndo(); b.photo = ''; renderAll(); markDirty(); }
      else if (act === 'dp-toggle') {
        var panel = sidebar.querySelector('[data-dp="' + path + '"]');
        if (!panel) return;
        var open = panel.hasAttribute('hidden');
        if (open) {
          var m = String(getByPath(path + '.time') || '').match(/(\d{4})[.\-/](\d{1,2})/g) || [];
          var norm = m.map(function (s) { return s.replace(/[.\/]/, '-').replace(/-(\d)$/, '-0$1'); });
          panel.querySelector('.dp-a').value = norm[0] || '';
          panel.querySelector('.dp-b').value = norm[1] || '';
          panel.querySelector('.dp-now').checked = /至今|今|present/i.test(String(getByPath(path + '.time') || ''));
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      } else if (act === 'dp-apply') {
        var panel2 = sidebar.querySelector('[data-dp="' + path + '"]');
        var a = panel2.querySelector('.dp-a').value;
        var b = panel2.querySelector('.dp-b').value;
        var now = panel2.querySelector('.dp-now').checked;
        var fmt = function (v) { return v ? v.replace('-', '.') : ''; };
        var text = fmt(a);
        if (text || b || now) text += '-' + (now ? '至今' : fmt(b));
        pushUndo();
        setByPath(path + '.time', text);
        renderAll();
        markDirty();
      } else if (act === 'add-entry') { addItem(path, 'entry'); }
      else if (act === 'add-text') { addItem(path, 'text'); }
      else if (act === 'add-list') { addItem(path, 'list'); }
      else if (act === 'add-blank') { addItem(path, 'blank'); }
      else if (act === 'item-up') { moveItem(path, -1); }
      else if (act === 'item-down') { moveItem(path, 1); }
      else if (act === 'item-del') { removeItem(path); }
      else if (act === 'item-copy') { copyItem(path); }
      else if (act === 'sec-add') { addSection($('#presetSelect') ? $('#presetSelect').value : '新模块'); }
      else if (act === 'sec-up') { moveSection(index, -1); }
      else if (act === 'sec-down') { moveSection(index, 1); }
      else if (act === 'sec-del') {
        if (!confirm('确定删除模块「' + App.resume.sections[index].title + '」？')) return;
        pushUndo(); App.resume.sections.splice(index, 1); renderAll(); markDirty();
      } else if (act === 'sec-copy') {
        pushUndo();
        var copy = clone(App.resume.sections[index]);
        copy.title = copy.title + ' 副本';
        App.resume.sections.splice(index + 1, 0, copy);
        renderAll(); markDirty();
      } else if (act === 'theme-reset') {
        if (!confirm('恢复默认版式参数？')) return;
        pushUndo();
        App.resume.theme = DEFAULT_THEME();
        renderAll(); markDirty();
      }
    });

    /* 拖拽排序 */
    var dragIndex = null;
    sidebar.addEventListener('dragstart', function (e) {
      var card = e.target.closest('.section-card');
      if (!card) return;
      dragIndex = parseInt(card.getAttribute('data-index'), 10);
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragIndex)); } catch (err) { }
    });
    sidebar.addEventListener('dragover', function (e) {
      var card = e.target.closest('.section-card');
      if (!card) return;
      e.preventDefault();
      $$('.section-card', sidebar).forEach(function (c) { c.classList.remove('drop-target'); });
      card.classList.add('drop-target');
    });
    sidebar.addEventListener('drop', function (e) {
      var card = e.target.closest('.section-card');
      if (!card || dragIndex === null) return;
      e.preventDefault();
      var to = parseInt(card.getAttribute('data-index'), 10);
      card.classList.remove('drop-target');
      if (to === dragIndex) return;
      pushUndo();
      var sections = App.resume.sections;
      var moved = sections.splice(dragIndex, 1)[0];
      sections.splice(to, 0, moved);
      dragIndex = null;
      App.selectedSection = to;
      renderAll();
      markDirty();
    });
    sidebar.addEventListener('dragend', function () {
      dragIndex = null;
      $$('.section-card', sidebar).forEach(function (c) { c.classList.remove('dragging', 'drop-target'); });
    });
  }

  /* -------------------------------------------------------- 预览内编辑 */
  function bindPreview() {
    var paper = $('#paper');

    paper.addEventListener('input', function (e) {
      var node = e.target.closest ? e.target.closest('[data-path]') : null;
      if (!node) return;
      setByPath(node.getAttribute('data-path'), node.textContent);
      markDirty();
    });

    paper.addEventListener('focusout', function (e) {
      var node = e.target.closest ? e.target.closest('[data-path]') : null;
      if (!node) return;
      setTimeout(function () {
        if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#paper')) return;
        renderPreview();
        renderSidebar();
      }, 0);
    });

    paper.addEventListener('keydown', function (e) {
      var node = e.target.closest ? e.target.closest('[data-path]') : null;
      if (!node) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        node.blur();
      } else if (e.key === 'Escape') {
        node.blur();
      }
    });

    paper.addEventListener('paste', function (e) {
      var node = e.target.closest ? e.target.closest('[data-path]') : null;
      if (!node) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text.replace(/\r?\n/g, ' '));
    });

    paper.addEventListener('click', function (e) {
      var photo = e.target.closest ? e.target.closest('.r-photo') : null;
      if (photo) { $('#fileAvatar').click(); return; }
      var sec = e.target.closest ? e.target.closest('.r-section') : null;
      if (sec) {
        App.selectedSection = parseInt(sec.getAttribute('data-section'), 10);
        $$('.section-card').forEach(function (c) {
          c.classList.toggle('is-selected', parseInt(c.getAttribute('data-index'), 10) === App.selectedSection);
        });
      }
    });
  }

  /* ------------------------------------------------------------ 导出 */
  function showOverlay(text, sub) {
    $('#overlayText').textContent = text || '正在生成…';
    $('#overlaySub').textContent = sub || '首次导出需要启动无头浏览器，请稍候';
    $('#overlay').classList.add('show');
  }
  function hideOverlay() { $('#overlay').classList.remove('show'); }

  function doExport(format, options) {
    if (!App.rid) return;
    showOverlay(format === 'pdf' ? '正在生成 PDF…' : '正在生成图片…');
    save().then(function () {
      return api('/api/export/' + App.rid, { method: 'POST', body: Object.assign({ format: format }, options || {}) });
    }).then(function (data) {
      hideOverlay();
      var a = document.createElement('a');
      a.href = data.url + '?t=' + Date.now();
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (format === 'png') {
        toast('图片已导出：' + data.width + ' × ' + data.height + ' px', 'ok');
      } else if (format === 'pdf') {
        toast('PDF 已导出：' + data.filename, 'ok');
      } else {
        toast('已导出：' + data.filename, 'ok');
      }
    }).catch(function (err) {
      hideOverlay();
      toast(err.message || '导出失败', 'err');
    });
  }

  /* ------------------------------------------------------------ 简历管理 */
  function loadList() {
    return api('/api/resumes').then(function (data) {
      App.list = data.items || [];
      return App.list;
    });
  }

  function openResume(id) {
    return api('/api/resume/' + id).then(function (resume) {
      App.rid = id;
      App.resume = resume;
      App.undoStack.length = 0;
      App.redoStack.length = 0;
      App.selectedSection = null;
      localStorage.setItem('resume.current', id);
      renderAll();
      fitZoom();
      return resume;
    });
  }

  function DEFAULT_THEME() {
    return {
      fontFamily: 'Microsoft YaHei', fontSize: 13.5, lineHeight: 21,
      textColor: '#000000', ruleColor: '#333333',
      padX: 52, padY: 27, nameSize: 28, titleSize: 17, infoSize: 14,
      sectionGap: 16.5, firstGap: 22, titleIndent: 4, bodyGap: 14,
      entryAlign: 'left', photoWidth: 117, photoHeight: 112, photoGap: 20
    };
  }

  function blankResume() {
    var r = clone(window.__SAMPLE_SHAPE__ || {});
    return r;
  }

  /* ================================================== 头像裁剪（选区域后上传） */
  var Crop = {
    img: null, natW: 0, natH: 0, dispW: 0, dispH: 0,
    sel: { x: 0, y: 0, w: 0, h: 0 }, ratio: 117 / 112, locked: true, drag: null
  };

  function drawCropSel() {
    var s = Crop.sel;
    var el = $('#cropSel');
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    el.style.width = s.w + 'px';
    el.style.height = s.h + 'px';
    var k = Crop.natW / Crop.dispW;
    $('#cropInfo').textContent = '选区 ' + Math.round(s.w * k) + ' × ' + Math.round(s.h * k) +
      ' px → 上传 ' + Math.round((App.resume.theme && App.resume.theme.photoWidth) || 117) + ' × ' +
      Math.round(((App.resume.theme && App.resume.theme.photoHeight) || 112)) + ' px';
  }

  function resetCropSel() {
    var W = Crop.dispW, H = Crop.dispH;
    var r = Crop.locked ? Crop.ratio : (W / H);
    var w = W, h = w / r;
    if (h > H) { h = H; w = h * r; }
    Crop.sel = { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
    drawCropSel();
  }

  function openCrop(file) {
    if (!file.type || file.type.indexOf('image/') !== 0) { toast('请选择图片文件', 'err'); return; }
    var url = URL.createObjectURL(file);
    var img = $('#cropImage');
    img.onload = function () {
      Crop.img = img;
      Crop.natW = img.naturalWidth || 1;
      Crop.natH = img.naturalHeight || 1;
      var maxW = Math.min(600, window.innerWidth - 140), maxH = Math.max(260, window.innerHeight - 380);
      var k = Math.min(maxW / Crop.natW, maxH / Crop.natH, 1);
      Crop.dispW = Math.max(60, Math.round(Crop.natW * k));
      Crop.dispH = Math.max(60, Math.round(Crop.natH * k));
      img.style.width = Crop.dispW + 'px';
      img.style.height = Crop.dispH + 'px';
      var stage = $('#cropStage');
      stage.style.width = Crop.dispW + 'px';
      stage.style.height = Crop.dispH + 'px';
      var t = App.resume.theme || {};
      Crop.ratio = (t.photoWidth || 117) / (t.photoHeight || 112);
      resetCropSel();
      $('#cropModal').classList.add('show');
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { toast('图片读取失败', 'err'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function closeCrop() {
    $('#cropModal').classList.remove('show');
    Crop.drag = null;
  }

  function cropResize(mode, dx, dy) {
    var o = Crop.drag.orig, W = Crop.dispW, H = Crop.dispH, r = Crop.ratio;
    var west = mode.indexOf('w') >= 0, east = mode.indexOf('e') >= 0;
    var north = mode.indexOf('n') >= 0, south = mode.indexOf('s') >= 0;
    var minW = 26;
    var l = o.x, t = o.y, rr = o.x + o.w, b = o.y + o.h;
    if (west) l = Math.max(0, Math.min(rr - minW, o.x + dx));
    if (east) rr = Math.min(W, Math.max(l + minW, o.x + o.w + dx));
    if (north) t = Math.max(0, Math.min(b - minW * 0.6, o.y + dy));
    if (south) b = Math.min(H, Math.max(t + minW * 0.6, o.y + o.h + dy));
    var w = rr - l, h = b - t;
    if (Crop.locked) {
      if ((west || east) && !(north || south)) {
        h = w / r;
        var cy = o.y + o.h / 2;
        t = cy - h / 2; b = cy + h / 2;
      } else if ((north || south) && !(west || east)) {
        w = h * r;
        var cx = o.x + o.w / 2;
        l = cx - w / 2; rr = cx + w / 2;
      } else {
        h = w / r;
        if (north) t = b - h; else b = t + h;
      }
    }
    if (w > W) { w = W; h = Crop.locked ? w / r : h; if (north) t = b - h; else b = t + h; }
    if (h > H) { h = H; w = Crop.locked ? h * r : w; if (west) l = rr - w; else rr = l + w; }
    if (l < 0) { rr -= l; l = 0; }
    if (t < 0) { b -= t; t = 0; }
    if (rr > W) { l -= (rr - W); rr = W; }
    if (b > H) { t -= (b - H); b = H; }
    l = Math.max(0, l); t = Math.max(0, t);
    Crop.sel = { x: l, y: t, w: Math.min(W, rr) - l, h: Math.min(H, b) - t };
    drawCropSel();
  }

  function bindCrop() {
    var stage = $('#cropStage');
    var sel = $('#cropSel');

    sel.addEventListener('mousedown', function (e) {
      if (!Crop.img) return;
      var h = e.target.getAttribute && e.target.getAttribute('data-h');
      Crop.drag = { mode: h || 'move', sx: e.clientX, sy: e.clientY, orig: Object.assign({}, Crop.sel) };
      document.body.classList.add('cropping');
      e.preventDefault();
      e.stopPropagation();
    });

    stage.addEventListener('mousedown', function (e) {
      if (!Crop.img) return;
      var rect = stage.getBoundingClientRect();
      var w = Math.min(Crop.sel.w, Crop.dispW), h = Crop.locked ? w / Crop.ratio : Crop.sel.h;
      Crop.sel = {
        x: Math.max(0, Math.min(Crop.dispW - w, e.clientX - rect.left - w / 2)),
        y: Math.max(0, Math.min(Crop.dispH - h, e.clientY - rect.top - h / 2)),
        w: w, h: h
      };
      drawCropSel();
      Crop.drag = { mode: 'move', sx: e.clientX, sy: e.clientY, orig: Object.assign({}, Crop.sel) };
      document.body.classList.add('cropping');
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!Crop.drag) return;
      var dx = e.clientX - Crop.drag.sx, dy = e.clientY - Crop.drag.sy;
      if (Crop.drag.mode === 'move') {
        var o = Crop.drag.orig;
        Crop.sel = {
          x: Math.max(0, Math.min(Crop.dispW - o.w, o.x + dx)),
          y: Math.max(0, Math.min(Crop.dispH - o.h, o.y + dy)),
          w: o.w, h: o.h
        };
        drawCropSel();
      } else {
        cropResize(Crop.drag.mode, dx, dy);
      }
    });

    document.addEventListener('mouseup', function () {
      if (!Crop.drag) return;
      Crop.drag = null;
      document.body.classList.remove('cropping');
    });

    $('#cropLock').onchange = function (e) {
      Crop.locked = e.target.checked;
      resetCropSel();
    };
    $('#cropReset').onclick = resetCropSel;
    $('#cropFull').onclick = function () {
      Crop.locked = false;
      $('#cropLock').checked = false;
      Crop.sel = { x: 0, y: 0, w: Crop.dispW, h: Crop.dispH };
      drawCropSel();
    };
    $('#cropCancel').onclick = closeCrop;
    $('#cropOk').onclick = confirmCrop;
    $('#cropModal').addEventListener('mousedown', function (e) {
      if (e.target === $('#cropModal')) closeCrop();
    });
    document.addEventListener('keydown', function (e) {
      if (!$('#cropModal').classList.contains('show')) return;
      if (e.key === 'Escape') closeCrop();
      if (e.key === 'Enter') confirmCrop();
    });
    window.addEventListener('resize', function () {
      if ($('#cropModal').classList.contains('show') && Crop.img) {
        var maxW = Math.min(600, window.innerWidth - 140), maxH = Math.max(260, window.innerHeight - 380);
        var k = Math.min(maxW / Crop.natW, maxH / Crop.natH, 1);
        Crop.dispW = Math.max(60, Math.round(Crop.natW * k));
        Crop.dispH = Math.max(60, Math.round(Crop.natH * k));
        Crop.img.style.width = Crop.dispW + 'px';
        Crop.img.style.height = Crop.dispH + 'px';
        stage.style.width = Crop.dispW + 'px';
        stage.style.height = Crop.dispH + 'px';
        resetCropSel();
      }
    });
  }

  function confirmCrop() {
    if (!Crop.img) return;
    var s = Crop.sel, k = Crop.natW / Crop.dispW;
    var sx = Math.max(0, Math.round(s.x * k));
    var sy = Math.max(0, Math.round(s.y * k));
    var sw = Math.min(Crop.natW - sx, Math.round(s.w * k));
    var sh = Math.min(Crop.natH - sy, Math.round(s.h * k));
    if (sw < 8 || sh < 8) { toast('选区太小，请重新选择', 'err'); return; }
    var t = App.resume.theme || {};
    var outW = Math.max(80, Math.round((t.photoWidth || 117) * 2));
    var outH = Math.max(40, Math.round(outW * sh / sw));
    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(Crop.img, sx, sy, sw, sh, 0, 0, outW, outH);
    closeCrop();
    canvas.toBlob(function (blob) {
      if (!blob) { toast('裁剪失败，请重试', 'err'); return; }
      uploadAvatarBlob(blob);
    }, 'image/jpeg', 0.93);
  }

  function uploadAvatarBlob(blob) {
    var fd = new FormData();
    fd.append('file', blob, 'avatar.jpg');
    showOverlay('正在上传头像…', '');
    fetch('/api/upload', { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (data) {
      hideOverlay();
      if (!data.url) throw new Error('上传失败');
      pushUndo();
      App.resume.basics.photo = data.url;
      App.resume.basics.showPhoto = true;
      renderAll();
      markDirty();
      toast('头像已更新', 'ok');
    }).catch(function (err) {
      hideOverlay();
      toast(err.message || '上传失败', 'err');
    });
  }

  /* ------------------------------------------------------------ 事件绑定 */
  function bindToolbar() {
    $('#btnZoomIn').onclick = function () { App.autoFit = false; App.zoom = Math.min(2, App.zoom + 0.1); applyZoom(); };
    $('#btnZoomOut').onclick = function () { App.autoFit = false; App.zoom = Math.max(0.3, App.zoom - 0.1); applyZoom(); };
    $('#btnZoomFit').onclick = function () { App.autoFit = true; fitZoom(); };
    $('#chkGuides').onchange = function (e) { App.showGuides = e.target.checked; updateGuides(); };

    $('#resumeSelect').onchange = function (e) { save().then(function () { openResume(e.target.value); }); };

    $('#btnNew').onclick = function (e) {
      api('/api/resume', { method: 'POST', body: { name: '新简历', mode: e.altKey ? 'blank' : 'sample' } }).then(function (data) {
        return loadList().then(function () { return openResume(data.id); });
      }).then(function () { toast('已新建简历', 'ok'); });
    };
    $('#btnRename').onclick = function () {
      var name = prompt('简历名称', App.resume.name || '');
      if (name === null) return;
      App.resume.name = name;
      save().then(loadList).then(renderTopbar);
    };
    $('#btnDuplicate').onclick = function () {
      save().then(function () {
        return api('/api/resume/' + App.rid + '/duplicate', { method: 'POST' });
      }).then(function (data) {
        return loadList().then(function () { return openResume(data.id); });
      }).then(function () { toast('已复制', 'ok'); });
    };
    $('#btnDelete').onclick = function () {
      if (!confirm('确定删除简历「' + (App.resume.name || '') + '」？此操作不可恢复。')) return;
      api('/api/resume/' + App.rid, { method: 'DELETE' }).then(function () {
        return loadList();
      }).then(function () {
        if (App.list.length) return openResume(App.list[0].id);
        return api('/api/default').then(function (d) { return loadList().then(function () { return openResume(d.id); }); });
      }).then(function () { toast('已删除', 'ok'); });
    };

    $('#btnUndo').onclick = undo;
    $('#btnImport').onclick = function () { $('#fileImport').click(); };
    $('#btnExportJson').onclick = function () {
      var blob = new Blob([JSON.stringify(App.resume, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (App.resume.name || 'resume') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    };
    $('#btnPrint').onclick = function () { save().then(function () { window.open('/print/' + App.rid, '_blank'); }); };
    $('#btnHtml').onclick = function () { doExport('html'); };
    $('#btnPdf').onclick = function () { doExport('pdf'); };
    $('#btnPng').onclick = function () { $('#pngModal').classList.add('show'); };
    $('#btnPngCancel').onclick = function () { $('#pngModal').classList.remove('show'); };
    $('#btnPngOk').onclick = function () {
      var scale = parseFloat(($('input[name=pngScale]:checked') || {}).value || '2');
      $('#pngModal').classList.remove('show');
      doExport('png', { scale: scale });
    };

    /* 选图 -> 打开裁剪框选区域 -> 确定后只上传框内区域 */
    $('#fileAvatar').onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) openCrop(file);
      e.target.value = '';
    };

    $('#fileImport').onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          api('/api/resume', { method: 'POST', body: { name: data.name || '导入的简历', data: data } })
            .then(function (created) { return loadList().then(function () { return openResume(created.id); }); })
            .then(function () { toast('导入成功', 'ok'); });
        } catch (err) { toast('导入失败：文件不是合法的 JSON', 'err'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    };

    document.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 's') { e.preventDefault(); save().then(function () { toast('已保存', 'ok'); }); }
      else if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (e.key === 'p') { e.preventDefault(); save().then(function () { window.open('/print/' + App.rid, '_blank'); }); }
    });

    window.addEventListener('resize', debounce(function () {
      setSidebarWidth($('#sidebar').offsetWidth);
      if (App.autoFit) fitZoom();
    }, 150));

    window.addEventListener('beforeunload', function (e) {
      if (App.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* -------------------------------------------------- 左侧面板宽度拖拽 */
  function setSidebarWidth(w) {
    var sidebar = $('#sidebar');
    var max = Math.min(780, window.innerWidth - 460);
    w = Math.max(280, Math.min(max, w));
    sidebar.style.flexBasis = w + 'px';
    sidebar.style.width = w + 'px';
    return w;
  }

  function bindSplitter() {
    var el = $('#splitter');
    if (!el) return;
    var saved = parseFloat(localStorage.getItem('resume.sidebarWidth') || '0');
    if (saved >= 280) setSidebarWidth(saved);
    var dragging = false;
    el.addEventListener('mousedown', function (e) {
      dragging = true;
      el.classList.add('active');
      document.body.classList.add('resizing');
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      setSidebarWidth(e.clientX);
      if (App.autoFit) fitZoom();
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('active');
      document.body.classList.remove('resizing');
      localStorage.setItem('resume.sidebarWidth', String($('#sidebar').offsetWidth));
      if (App.autoFit) fitZoom();
    });
    el.addEventListener('dblclick', function () {
      setSidebarWidth(400);
      localStorage.removeItem('resume.sidebarWidth');
      if (App.autoFit) fitZoom();
    });
  }

  /* ------------------------------------------------------------ 启动 */
  function boot() {
    bindSidebar();
    bindSplitter();
    bindCrop();
    bindPreview();
    bindToolbar();
    api('/api/default').then(function (data) {
      return loadList().then(function () {
        var last = localStorage.getItem('resume.current');
        var pick = (last && App.list.some(function (r) { return r.id === last; })) ? last : data.id;
        return openResume(pick);
      });
    }).catch(function (err) {
      toast('初始化失败：' + err.message, 'err');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
