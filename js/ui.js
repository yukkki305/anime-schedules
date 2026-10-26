// ui.js —— 负责「把数据变成页面上的卡片」和「更新那行提示文字」。
// 阶段 2：多了真实封面图、多了状态提示。排序、点击切换、完整三态留给后面的阶段。

(function () {
  'use strict';

  // 封面图片最多等这么久，还下不来就撤掉，退回灰色占位块。
  // 实测这台机器访问 AniList 的图片服务器很慢（一张图要 10–50 秒），
  // 没有这个兜底的话，卡片会一直挂着一个空框。
  var IMAGE_TIMEOUT_MS = 12000;

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
      img.src = item.coverUrl;
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
    title.textContent = item.title;
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

  // 挂到 window 上，让 main.js 能调用（不用 ES 模块，所以只能靠 window 传）
  window.UI = {
    renderCards: renderCards,
    setStatus: setStatus
  };
})();
