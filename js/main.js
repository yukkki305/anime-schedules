// main.js —— 程序入口，页面一打开就跑这里。
// 阶段 4a：加载中画骨架卡片，出错画错误块并给「重试」按钮，这天没排播画空状态。

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
      // 缓存命中：不请求，直接画。
      // 但仍然过一遍中文名（表在本地缓存里，不用再联网），
      // 这样就算缓存是「还没有中文名」的版本，也能补上中文。
      var cachedSeq = ++requestSeq;
      loadingDayKey = '';
      window.Zh.attach(cached, dayKey).then(function (list) {
        if (cachedSeq !== requestSeq) {
          return;   // 这期间用户又点了别的日子，这份结果就作废
        }
        if (list.length) {
          renderList(list);
          window.UI.setStatus(
            '共 ' + list.length + ' 部 · ' + describe(dayKey) + ' · ' + cacheLabel(),
            false
          );
        } else {
          // 「这天确实没排播」也会被缓存下来，再点一次还是显示空状态，而不是空白
          window.UI.renderEmpty(describe(dayKey) + ' 这一天 AniList 上没有查到播出安排。');
          window.UI.setStatus('');
        }
      });
      return;
    }

    if (loadingDayKey === dayKey) {
      return;   // 这一天正在请求，别重复发
    }
    loadingDayKey = dayKey;
    var mySeq = ++requestSeq;

    window.UI.renderSkeleton();   // 先画骨架，免得白屏让人以为坏了
    window.UI.setStatus('正在查询 ' + describe(dayKey) + '…（AniList 一般要 5–8 秒）');

    // 中文名表（来自 yuc.wiki，约 1 秒）和 AniList 同时开始抓，谁也不等谁。
    // 这里不接它的结果，只是让它早点开始；真正取用是在下面 attach 的时候。
    window.Zh.getTable(dayKey);

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
        return null;
      }
      // 给每部番补中文名。抓不到/yuc 改版时它是原样返回，不会让整个加载失败。
      return window.Zh.attach(list, dayKey);
    }).then(function (list) {
      if (!list || mySeq !== requestSeq) {
        return;
      }
      loadingDayKey = '';
      window.CacheStore.set(dayKey, list);

      if (!list.length) {
        window.UI.renderEmpty(describe(dayKey) + ' 这一天 AniList 上没有查到播出安排。');
        window.UI.setStatus('');
        return;
      }

      renderList(list);
      window.UI.setStatus('共 ' + list.length + ' 部 · ' + describe(dayKey) + ' · 北京时间');
    }).catch(function (err) {
      if (mySeq !== requestSeq) {
        return;
      }
      loadingDayKey = '';
      // 错误块里带一个「重试」按钮，点它就重新请求这一天（不用让用户刷新页面）
      window.UI.renderError('查 ' + describe(dayKey) + ' 的时候出错了：' + err.message + '。点下面的按钮再试一次。', function () {
        loadDay(dayKey);
      });
      window.UI.setStatus('加载失败：' + err.message, true);
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
