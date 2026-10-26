// main.js —— 程序入口，页面一打开就跑这里。
// 阶段 2：只做「今天」—— 拿北京时间的今天，去 AniList 要当天的播出安排。

(function () {
  'use strict';

  // 封面图开关。实测这台机器从 AniList 的图片服务器下一张封面要 10–50 秒，
  // 10 张一起下，页面会有一分钟挂着灰框，很难看，所以先关掉，用彩色块代替。
  // 如果你的网络（比如挂了代理）访问 AniList 图片很快，把下面改成 true 即可。
  var SHOW_COVER = false;

  var dayKey = window.Time.todayKey();

  highlightToday(dayKey);
  window.UI.setStatus('加载中…（AniList 一般要 5–8 秒）');

  window.Api.fetchDay(dayKey, function (attempt, waitMs, err) {
    // 重试中：告诉用户发生了什么，别让人以为卡死了
    window.UI.setStatus(
      '第 ' + attempt + ' 次失败（' + err.message + '），' + Math.round(waitMs / 1000) + ' 秒后自动重试…',
      true
    );
  }).then(function (list) {
    if (!list.length) {
      window.UI.renderCards([]);
      window.UI.setStatus('今天（' + dayKey + '）没有查到播出安排。');
      return;
    }

    if (!SHOW_COVER) {
      // 关掉封面时不改数据结构，只是把地址清空，让 ui.js 用彩色块顶上
      for (var i = 0; i < list.length; i++) {
        list[i].coverUrl = '';
      }
    }

    window.UI.renderCards(list);
    window.UI.setStatus('共 ' + list.length + ' 部 · ' + dayKey + ' · 北京时间');
  }).catch(function (err) {
    window.UI.renderCards([]);
    window.UI.setStatus('加载失败：' + err.message + '。检查一下网络，然后刷新页面重试。', true);
  });

  // 把「今天」对应的按钮点亮（0 = 周日 … 6 = 周六）
  function highlightToday(key) {
    var todayNumber = window.Time.weekdayNumber(key);
    var buttons = document.querySelectorAll('.weekday-btn');

    for (var i = 0; i < buttons.length; i++) {
      var isToday = Number(buttons[i].getAttribute('data-weekday')) === todayNumber;
      if (isToday) {
        buttons[i].classList.add('is-active');
      } else {
        buttons[i].classList.remove('is-active');
      }
    }
  }
})();
