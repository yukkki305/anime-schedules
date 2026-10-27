// ui.js —— 负责「把数据变成页面上的卡片」和「更新那行提示文字」。
// 阶段 4a：多了三种状态的画面——加载中（骨架）、出错（带重试按钮）、空（这天没排播）。

(function () {
  'use strict';

  // 封面图片最多等这么久，还下不来就撤掉，退回彩色占位块。
  // 现在封面走中转站，通常一秒就下来；这个兜底是防中转站哪天挂掉或变慢，
  // 那样卡片会一直挂着一个空框，很难看。
  var IMAGE_TIMEOUT_MS = 12000;

  // 封面图走这个「加速中转站」。原因：实测这台机器直连 AniList 的图片服务器
  //（s4.anilist.co）一张图要 10–50 秒，而经 i0.wp.com 转发后 10 张一起下只要 1 秒多。
  // 用法很简单：把原地址的 https:// 去掉，接在这个前缀后面。
  var COVER_PROXY = 'https://i0.wp.com/';

  // 没有封面图时用的占位色，按顺序轮流取，卡片不会一片死灰
  var PLACEHOLDER_COLORS = ['#c7d2fe', '#fbcfe8', '#bbf7d0', '#fde68a', '#bae6fd', '#ddd6fe', '#fecaca', '#a7f3d0'];

  // 造一张卡片。注意：文字一律用 textContent 塞进去，
  // 不用 innerHTML —— 这样标题里就算带 < > 符号也不会被当成代码执行。
  function createCard(item, index) {
    var card = document.createElement('article');
    card.className = 'card';

    // 封面：有图片地址就显示图片，没有就退回到纯色块
    var cover = document.createElement('div');
    cover.className = 'card-cover';

    if (item.coverUrl) {
      var img = document.createElement('img');
      img.className = 'card-cover-img';
      // 前面拼上中转站前缀；原地址里的 https:// 要去掉，中转站不认它。
      // 后面的 ?w=160 是让中转站把图缩到 160 像素宽：卡片最宽才 80 像素，
      // 160 在高清屏上也够清楚，而文件小了一半左右，下得更快。
      img.src = COVER_PROXY + item.coverUrl.replace(/^https?:\/\//, '') + '?w=160';
      img.alt = ''; // 封面只是装饰，标题就在旁边，读屏软件不用重复念

      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) {
          img.remove();
        }
      }, IMAGE_TIMEOUT_MS);

      img.addEventListener('load', function () {
        settled = true;
        clearTimeout(timer);
      });
      img.addEventListener('error', function () {
        // 图片加载失败（链接失效）时，别留一个破图标，删掉退回色块
        settled = true;
        clearTimeout(timer);
        img.remove();
      });
      cover.appendChild(img);
    } else {
      // 没有封面地址（或后面把封面关掉了）就退回彩色占位块
      cover.style.backgroundColor = item.coverColor || PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
    }
    card.appendChild(cover);

    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('h2');
    title.className = 'card-title';
    if (item.titleZh) {
      // 有中文名：上面一行中文，下面一行罗马音（小一号灰字）
      var zh = document.createElement('span');
      zh.className = 'card-title-zh';
      zh.textContent = item.titleZh;

      var romaji = document.createElement('span');
      romaji.className = 'card-title-romaji';
      romaji.textContent = item.title;

      title.appendChild(zh);
      title.appendChild(romaji);
    } else {
      // 没有中文名：只显示罗马音
      title.textContent = item.title;
    }
    body.appendChild(title);

    var meta = document.createElement('p');
    meta.className = 'card-meta';

    var time = document.createElement('span');
    time.className = 'card-time';
    time.textContent = item.timeText;
    meta.appendChild(time);

    var episode = document.createElement('span');
    episode.className = 'card-episode';
    episode.textContent = item.episodeText;
    meta.appendChild(episode);

    body.appendChild(meta);

    var score = document.createElement('p');
    score.className = 'card-score';
    score.textContent = item.scoreText;
    body.appendChild(score);

    card.appendChild(body);
    return card;
  }

  // 把一组数据画进 #schedule。每次先清空，避免重复叠加。
  function renderCards(list) {
    var container = document.getElementById('schedule');
    if (!container) {
      return;
    }
    container.textContent = '';

    for (var i = 0; i < list.length; i++) {
      container.appendChild(createCard(list[i], i));
    }
  }

  // 更新底部那行提示。isError 为 true 时显示成红色。
  function setStatus(text, isError) {
    var el = document.getElementById('status');
    if (!el) {
      return;
    }
    el.textContent = text || '';
    if (isError) {
      el.classList.add('is-error');
    } else {
      el.classList.remove('is-error');
    }
  }

  // —————————— 下面是「三种状态」的画面 ——————————

  // 加载中画几个骨架卡片。数量和形状都贴着真卡片，
  // 这样数据回来替换成真卡片时，页面高度几乎不变，不会「跳一下」。
  var SKELETON_COUNT = 5;

  function renderSkeleton(count) {
    var container = document.getElementById('schedule');
    if (!container) {
      return;
    }
    container.textContent = '';

    var total = count || SKELETON_COUNT;
    for (var i = 0; i < total; i++) {
      var card = document.createElement('article');
      card.className = 'card is-skeleton';
      card.setAttribute('aria-hidden', 'true'); // 纯装饰，读屏软件不用念

      var cover = document.createElement('div');
      cover.className = 'card-cover skeleton-bar';
      card.appendChild(cover);

      var body = document.createElement('div');
      body.className = 'card-body skeleton-body';

      var titleLine = document.createElement('div');
      titleLine.className = 'skeleton-bar skeleton-line is-title';
      body.appendChild(titleLine);

      var metaLine = document.createElement('div');
      metaLine.className = 'skeleton-bar skeleton-line is-meta';
      body.appendChild(metaLine);

      var scoreLine = document.createElement('div');
      scoreLine.className = 'skeleton-bar skeleton-line is-score';
      body.appendChild(scoreLine);

      card.appendChild(body);
      container.appendChild(card);
    }
  }

  // 出错：一个明确的错误块 + 「重试」按钮
  function renderError(message, onRetry) {
    var container = document.getElementById('schedule');
    if (!container) {
      return;
    }
    container.textContent = '';

    var block = document.createElement('div');
    block.className = 'state-block is-error';
    block.setAttribute('role', 'alert'); // 让读屏软件主动念出来

    var title = document.createElement('p');
    title.className = 'state-title';
    title.textContent = '加载失败';
    block.appendChild(title);

    var text = document.createElement('p');
    text.className = 'state-text';
    text.textContent = message;
    block.appendChild(text);

    if (typeof onRetry === 'function') {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'retry-btn';
      button.textContent = '重试';
      button.addEventListener('click', function () {
        // 点一下先按下去，免得手抖连点发出好几次请求
        button.disabled = true;
        button.textContent = '正在重试…';
        onRetry();
      });
      block.appendChild(button);
    }

    container.appendChild(block);
  }

  // 空：这一天确实没有查到排播
  function renderEmpty(message) {
    var container = document.getElementById('schedule');
    if (!container) {
      return;
    }
    container.textContent = '';

    var block = document.createElement('div');
    block.className = 'state-block';

    var title = document.createElement('p');
    title.className = 'state-title';
    title.textContent = '这天没有排播';
    block.appendChild(title);

    var text = document.createElement('p');
    text.className = 'state-text';
    text.textContent = message;
    block.appendChild(text);

    container.appendChild(block);
  }

  // 挂到 window 上，让 main.js 能调用（不用 ES 模块，所以只能靠 window 传）
  window.UI = {
    renderCards: renderCards,
    renderSkeleton: renderSkeleton,
    renderError: renderError,
    renderEmpty: renderEmpty,
    setStatus: setStatus
  };
})();
