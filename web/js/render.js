/* ==========================================================================
   resume-render.js —— 简历 DOM 渲染器
   预览页与导出页共用同一套渲染逻辑，确保导出结果与预览像素级一致。
   ========================================================================== */
(function (global) {
  'use strict';

  var THEME_MAP = {
    fontFamily: function (v) { return '"' + v + '", "Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif'; },
    fontSize: function (v) { return v + 'px'; },
    lineHeight: function (v) { return v + 'px'; },
    textColor: function (v) { return v; },
    ruleColor: function (v) { return v; },
    padX: function (v) { return v + 'px'; },
    padY: function (v) { return v + 'px'; },
    nameSize: function (v) { return v + 'px'; },
    titleSize: function (v) { return v + 'px'; },
    infoSize: function (v) { return v + 'px'; },
    sectionGap: function (v) { return v + 'px'; },
    firstGap: function (v) { return v + 'px'; },
    titleIndent: function (v) { return v + 'px'; },
    bodyGap: function (v) { return v + 'px'; },
    photoWidth: function (v) { return v + 'px'; },
    photoHeight: function (v) { return v + 'px'; },
    photoGap: function (v) { return v + 'px'; },
    colTime: function (v) { return v + 'px'; },
    colMid: function (v) { return v + 'px'; },
    colRight: function (v) { return v + 'px'; }
  };

  var VAR_MAP = {
    fontFamily: '--rc-font', fontSize: '--rc-body-size', lineHeight: '--rc-line',
    textColor: '--rc-text', ruleColor: '--rc-rule', padX: '--rc-pad-x', padY: '--rc-pad-y',
    nameSize: '--rc-name-size', titleSize: '--rc-title-size', infoSize: '--rc-info-size',
    sectionGap: '--rc-section-gap', firstGap: '--rc-first-gap', titleIndent: '--rc-title-indent',
    bodyGap: '--rc-body-gap', photoWidth: '--rc-photo-w', photoHeight: '--rc-photo-h',
    photoGap: '--rc-photo-gap', colTime: '--rc-col-time', colMid: '--rc-col-mid',
    colRight: '--rc-col-right'
  };

  function applyTheme(paper, theme) {
    theme = theme || {};
    Object.keys(THEME_MAP).forEach(function (key) {
      if (theme[key] === undefined || theme[key] === null || theme[key] === '') return;
      paper.style.setProperty(VAR_MAP[key], THEME_MAP[key](theme[key]));
    });
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function editable(node, opts, path, placeholder) {
    if (!path) return node;
    node.setAttribute('data-path', path);
    if (opts.editable !== false) {
      node.setAttribute('contenteditable', 'true');
      node.setAttribute('spellcheck', 'false');
      if (placeholder) node.setAttribute('data-ph', placeholder);
    }
    return node;
  }

  function line(text) {
    return document.createTextNode(text);
  }

  /* 判断一条内容是否为空：导出时自动隐藏，编辑时保留占位以便填写 */
  function isBlankItem(item) {
    if (!item) return true;
    if (item.type === 'blank') return false;
    if (item.type === 'entry') {
      var head = !!(item.time || item.title || item.mid || item.right);
      var details = item.details || [];
      for (var i = 0; i < details.length; i++) {
        if (!isBlankItem(details[i])) return false;
      }
      return !head;
    }
    var value = (item.value === undefined || item.value === null) ? '' : String(item.value);
    if (item.type === 'list') return value === '';
    var label = (item.label === undefined || item.label === null) ? '' : String(item.label);
    return value === '' && label === '';
  }

  function markBlank(node, opts, item) {
    if (node && opts.editable === false && isBlankItem(item)) node.classList.add('is-empty');
    return node;
  }

  /* ------------------------------------------------------------- 基本信息 */
  function renderHeader(paper, resume, opts) {
    var basics = resume.basics || {};
    var header = el('header', 'r-header');
    var left = el('div', 'r-head-left');

    var name = el('h1', 'r-name');
    name.textContent = basics.name || '';
    editable(name, opts, 'basics.name', '姓名');
    if (opts.editable === false && !String(basics.name || '').trim()) name.classList.add('is-empty');
    left.appendChild(name);

    var infos = el('div', 'r-infos');
    (basics.info || []).forEach(function (item, i) {
      if (item.visible === false) return;
      var wrap = el('span', 'r-info');
      wrap.setAttribute('data-info', String(i));
      if (item.label !== undefined && item.label !== null && item.label !== '') {
        var label = el('span', 'r-info-label');
        label.textContent = item.label;
        editable(label, opts, 'basics.info.' + i + '.label', '标签');
        wrap.appendChild(label);
        var colon = el('span', 'r-info-colon');
        colon.textContent = '：';
        wrap.appendChild(colon);
      }
      var value = el('span', 'r-info-value');
      value.textContent = (item.value === undefined || item.value === null) ? '' : ' ' + item.value;
      editable(value, opts, 'basics.info.' + i + '.value', '内容');
      wrap.appendChild(value);
      if (opts.editable === false && !String(item.value || '').trim()) wrap.classList.add('is-empty');
      infos.appendChild(wrap);
    });
    left.appendChild(infos);
    header.appendChild(left);

    var hasPhoto = basics.showPhoto !== false && !!basics.photo;
    if (hasPhoto || opts.editable !== false) {
      var photo = el('div', 'r-photo');
      photo.setAttribute('data-photo', '1');
      if (hasPhoto) {
        var img = el('img');
        img.src = basics.photo;
        img.alt = '';
        photo.appendChild(img);
      } else {
        photo.classList.add('is-placeholder');
        photo.setAttribute('data-ph', '点击上传头像');
      }
      header.appendChild(photo);
    }
    paper.appendChild(header);
    // 没有头像时左侧占满整行
    if (!hasPhoto) left.classList.add('is-full');
  }

  /* --------------------------------------------------------------- 条目行 */
  function renderEntry(item, path, opts) {
    var entry = el('div', 'r-entry');
    var head = el('div', 'r-entry-head');
    if ((opts.theme && opts.theme.entryAlign) === 'center') head.classList.add('is-center');

    var time = el('div', 'r-entry-time');
    time.textContent = item.time || '';
    editable(time, opts, path + '.time', '时间');
    head.appendChild(time);

    var title = el('div', 'r-entry-title');
    title.textContent = item.title || '';
    editable(title, opts, path + '.title', '名称');
    head.appendChild(title);

    var mid = el('div', 'r-entry-mid');
    mid.textContent = item.mid || '';
    editable(mid, opts, path + '.mid', '');
    head.appendChild(mid);

    var right = el('div', 'r-entry-right');
    right.textContent = item.right || '';
    editable(right, opts, path + '.right', '职位');
    head.appendChild(right);

    entry.appendChild(head);

    var body = el('div', 'r-entry-body');
    var details = item.details || [];
    for (var i = 0; i < details.length; i++) {
      var node = renderItem(details[i], path + '.details.' + i, opts, i);
      if (node) body.appendChild(node);
    }
    if (body.childNodes.length || opts.editable !== false) entry.appendChild(body);
    return markBlank(entry, opts, item);
  }

  /* --------------------------------------------------------------- 普通项 */
  function renderItem(item, path, opts, index) {
    if (!item) return null;
    var type = item.type || 'text';

    if (type === 'entry') return renderEntry(item, path, opts);

    if (type === 'blank') {
      var blank = el('div', 'r-item r-blank');
      blank.innerHTML = '&nbsp;';
      return blank;
    }

    var node = el('div', 'r-item ' + (type === 'list' ? 'r-list' : 'r-text'));

    if (type === 'list') {
      var marker = item.marker === undefined ? '+' : item.marker;
      if (marker === 'auto') marker = (index + 1) + '.';
      if (marker) {
        var mk = el('span', 'r-marker');
        mk.textContent = marker;
        node.appendChild(mk);
      }
    } else {
      var labelText = item.label === undefined || item.label === null ? '' : String(item.label);
      if (labelText) {
        var lb = el('span', 'r-label');
        lb.textContent = labelText;
        editable(lb, opts, path + '.label', '标签');
        node.appendChild(lb);
        var cl = el('span', 'r-colon');
        cl.textContent = '：';
        node.appendChild(cl);
      }
    }

    var val = el('span', 'r-value');
    val.textContent = item.value === undefined || item.value === null ? '' : String(item.value);
    editable(val, opts, path + '.value', type === 'list' ? '内容' : '');
    node.appendChild(val);
    return markBlank(node, opts, item);
  }

  /* --------------------------------------------------------------- 模块 */
  function renderSection(section, index, opts) {
    var sec = el('section', 'r-section');
    sec.setAttribute('data-section', String(index));
    if (section.spaceBefore) sec.classList.add('has-space');

    var title = el('h2', 'r-section-title');
    title.textContent = section.title || '';
    editable(title, opts, 'sections.' + index + '.title', '模块标题');
    sec.appendChild(title);

    var rule = el('div', 'r-rule');
    sec.appendChild(rule);

    var body = el('div', 'r-section-body');
    var items = section.items || [];
    for (var i = 0; i < items.length; i++) {
      var node = renderItem(items[i], 'sections.' + index + '.items.' + i, opts, i);
      if (node) body.appendChild(node);
    }
    if (opts.editable !== false && !body.childNodes.length) {
      var hint = el('div', 'r-item r-hint');
      hint.textContent = '（空模块）点击左侧“添加内容”';
      body.appendChild(hint);
    }
    sec.appendChild(body);
    return sec;
  }

  function render(paper, resume, opts) {
    opts = opts || {};
    resume = resume || {};
    var theme = resume.theme || {};
    opts.theme = theme;
    paper.innerHTML = '';
    paper.className = 'paper' + (opts.editable !== false ? ' is-editable' : '');
    paper.style.cssText = '';
    applyTheme(paper, theme);
    renderHeader(paper, resume, opts);
    (resume.sections || []).forEach(function (section, i) {
      if (section.visible === false) return;
      paper.appendChild(renderSection(section, i, opts));
    });
    return paper;
  }

  /* 依据 path 取/设值：'sections.0.items.1.title' */
  function getByPath(obj, path) {
    var parts = String(path || '').split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setByPath(obj, path, value) {
    var parts = String(path || '').split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === undefined || cur[parts[i]] === null) return false;
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return true;
  }

  global.ResumeRenderer = {
    render: render,
    applyTheme: applyTheme,
    getByPath: getByPath,
    setByPath: setByPath,
    THEME_MAP: THEME_MAP
  };
})(window);
