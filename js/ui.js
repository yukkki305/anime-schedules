// ui.js —— 负责「把数据变成页面上的卡片」。
// 阶段 1：只有渲染。排序、点击切换、加载/错误/空三态，都留给后面的阶段。

(function () {
  'use strict';

  // 造一张卡片。注意：文字一律用 textContent 塞进去，
  // 不用 innerHTML —— 这样标题里就算带 < > 符号也不会被当成代码执行。
  function createCard(item) {
    var card = document.createElement('article');
    card.className = 'card';

    // 封面位置：阶段 1 用纯色块占位，阶段 2 换成真实图片
    var cover = document.createElement('div');
    cover.className = 'card-cover';
    if (item.coverColor) {
      cover.style.backgroundColor = item.coverColor;
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
      container.appendChild(createCard(list[i]));
    }
  }

  // 挂到 window 上，让 main.js 能调用（不用 ES 模块，所以只能靠 window 传）
  window.UI = {
    renderCards: renderCards
  };
})();
