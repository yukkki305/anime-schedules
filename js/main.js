// main.js —— 程序入口，页面一打开就跑这里。
// 阶段 3：7 个星期按钮能点了，点哪天看哪天；同一天 30 分钟内再看直接用缓存，不再请求。

(function () {
  'use strict';

  // 封面图开关。直连 AniList 图片服务器太慢（一张 10–50 秒），
  // 所以封面统一走 js/ui.js 里的中转站（i0.wp.com），实测 10 张一起 1 秒多。
  // 想回到「只有彩色块、完全不加载图片」的样子，把这里改成 false 即可。
  var SHOW_COVER = true;

  // 0 = 周日 … 6 = 周六，和 index.html 里 data-weekday 的编号一致
  var WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  var todayKey = window.Time.todayKey();
  var weekMonday = window.Time.mondayOf(todayKey);   // 本周周一（一周从周一开始算）
  var requestSeq = 0;        // 每次请求自增，用来丢掉「过期的结果」（快速连点时）
  var loadingDayKey = '';    // 正在请求哪一天，防止同一天被连点两次

  wireButtons();
  loadDay(todayKey);

  // 把一个星期编号换算成「本周的那一天」
  function dateOfWeekday(weekday) {
    var offset = (weekday + 6) % 7;   // 周一 = 0 天，周日 = 6 天
    return window.Time.addDays(weekMonday, offset);
  }

  // 给 7 个按钮绑定点击
  function wireButtons() {
    var nav = document.querySelector('.weekday-nav');
    if (!nav) {
      return;
    }
    nav.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.weekday-btn') : null;
      if (!button) {
        return;
      }
      var weekday = Number(button.getAttribute('data-weekday'));
      if (isNaN(weekday)) {
        return;
      }
      setActiveWeekday(weekday);
      loadDay(dateOfWeekday(weekday));
    });
  }

  // 点亮某一个按钮，其余熄灭
  function setActiveWeekday(weekday) {
    var buttons = document.querySelectorAll('.weekday-btn');
    for (var i = 0; i < buttons.length; i++) {
      var isThis = Number(buttons[i].getAttribute('data-weekday')) === weekday;
      if (isThis) {
        buttons[i].classList.add('is-active');
      } else {
        buttons[i].classList.remove('is-active');
      }
    }
  }

  // 加载某一天：先看缓存，没有再去请求
  function loadDay(dayKey) {
    var cached = window.CacheStore.get(dayKey);

    if (cached) {
      // 缓存命中：不请求，直接画
      renderList(cached);
      window.UI.setStatus(
        '共 ' + cached.length + ' 部 · ' + describe(dayKey) + ' · ' + cacheLabel(),
        false
      );
      return;
    }

    if (loadingDayKey === dayKey) {
      return;   // 这一天正在请求，别重复发
    }
    loadingDayKey = dayKey;
    var mySeq = ++requestSeq;

    window.UI.renderCards([]);   // 先清空，免得上一天的数据留在新日期下面
    window.UI.setStatus('加载中…（' + describe(dayKey) + '，AniList 一般要 5–8 秒）');

    window.Api.fetchDay(dayKey, function (attempt, waitMs, err) {
      if (mySeq !== requestSeq) {
        return;
      }
      // 重试中：告诉用户发生了什么，别让人以为卡死了
      window.UI.setStatus(
        '第 ' + attempt + ' 次失败（' + err.message + '），' + Math.round(waitMs / 1000) + ' 秒后自动重试…',
        true
      );
    }).then(function (list) {
      if (mySeq !== requestSeq) {
        return;
      }
      loadingDayKey = '';
      window.CacheStore.set(dayKey, list);

      if (!list.length) {
        window.UI.renderCards([]);
        window.UI.setStatus(describe(dayKey) + ' 没有查到播出安排。');
        return;
      }

      renderList(list);
      window.UI.setStatus('共 ' + list.length + ' 部 · ' + describe(dayKey) + ' · 北京时间');
    }).catch(function (err) {
      if (mySeq !== requestSeq) {
        return;
      }
      loadingDayKey = '';
      window.UI.renderCards([]);
      window.UI.setStatus('加载失败：' + err.message + '。检查一下网络，然后刷新页面重试。', true);
    });
  }

  // 真正画到页面上；封面关掉时把图片地址清空，让 ui.js 用彩色块顶上
  function renderList(list) {
    if (!SHOW_COVER) {
      for (var i = 0; i < list.length; i++) {
        list[i].coverUrl = '';
      }
    }
    window.UI.renderCards(list);
  }

  // '2026-10-27' -> '10-27 周二'
  function describe(dayKey) {
    var p = dayKey.split('-');
    return Number(p[1]) + '-' + Number(p[2]) + ' ' + WEEK_NAMES[window.Time.weekdayNumber(dayKey)];
  }

  // 缓存有两种：硬盘上的（刷新还在）和内存里的（刷新就没）
  function cacheLabel() {
    return window.CacheStore.persistent ? '来自缓存（30 分钟内有效）' : '来自本次打开的缓存（刷新后失效）';
  }
})();
