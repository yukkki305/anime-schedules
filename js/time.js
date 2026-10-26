// time.js —— 时间换算。
// 接口给的是「UNIX 时间戳」（从 1970 年起的秒数），是绝对的某一刻，
// 不带时区信息。这里负责把它换算成北京时间的「周几 时:分」。

(function () {
  'use strict';

  var BEIJING = 'Asia/Shanghai';

  // 北京固定 UTC+8，从 1991 年起没有夏令时。
  // 只有「算某一天从几点开始」这种纯日期加减会用到它；
  // 给用户看的时间一律走下面的 Intl，不手写 +8。
  var OFFSET_SECONDS = 8 * 60 * 60;

  // 用浏览器自带的 Intl 换算，避免自己处理时区规则出错
  var formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',   // 保证是 00:30，而不是 24:30
    weekday: 'short'
  });

  var WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 把时间戳拆成 { year, month, day, hour, minute, weekday }
  function parts(unixSeconds) {
    var result = {};
    var pieces = formatter.formatToParts(new Date(unixSeconds * 1000));
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i].type !== 'literal') {
        result[pieces[i].type] = pieces[i].value;
      }
    }
    return result;
  }

  // 时间戳 -> '2026-10-27'（北京时间的日期）
  function dayKey(unixSeconds) {
    var p = parts(unixSeconds);
    return p.year + '-' + p.month + '-' + p.day;
  }

  // 时间戳 -> '周二 22:00'
  function cardTime(unixSeconds) {
    var p = parts(unixSeconds);
    return p.weekday + ' ' + p.hour + ':' + p.minute;
  }

  // 此刻在北京是哪一天
  function todayKey() {
    return dayKey(Math.floor(Date.now() / 1000));
  }

  // '2026-10-27' -> 北京时间当天 00:00:00 的时间戳
  function dayStartSeconds(key) {
    var p = key.split('-');
    var utcMidnight = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 1000;
    return Math.round(utcMidnight) - OFFSET_SECONDS;
  }

  // '2026-10-27' -> { start: 当天0点的时间戳, end: 次日0点的时间戳 }
  function dayRange(key) {
    var start = dayStartSeconds(key);
    return { start: start, end: start + 86400 };
  }

  // '2026-10-27' -> 0（周日）… 6（周六）
  function weekdayNumber(key) {
    var p = parts(dayStartSeconds(key));
    return WEEK_LABELS.indexOf(p.weekday);
  }

  window.Time = {
    dayKey: dayKey,
    cardTime: cardTime,
    todayKey: todayKey,
    dayRange: dayRange,
    weekdayNumber: weekdayNumber
  };
})();
