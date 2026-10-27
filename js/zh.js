// zh.js —— 给日本动画找中文名。
//
// 现在按「甲方案」工作：**先查本地对照表** `data/titles-zh.js`。
// 表里键是 AniList 的番剧 id，值是中文名 —— id 是唯一的，所以只要查到就一定对，
// 绝不会出现「把 A 的中文名贴到 B 上」这种事。
//
// 表里没有的番（新番、冷门番、yuc 没收录的），才走「兜底」：
// 去 yuc.wiki（长门番堂，中文圈常用的每季新番表，简体译名）抓当季页面，
// 靠「星期 + 日本时间 + 首播日期」猜配对。
// 但这里是猜的，所以规则很保守：分不清（同一时间好几部、首播日对不上）就
// 宁可不显示中文，绝不乱配。
//
// 兜底原则：抓不到、太慢、对方改版解析不出来 —— 全部当作「没有中文名」，
// 页面照旧显示罗马音，其他功能一点不受影响。

(function () {
  'use strict';

  var ORIGIN = 'https://yuc.wiki/';

  // 兜底开关：表里查不到的番，要不要再去 yuc.wiki 猜一个中文名。
  // 2026-10-27 实测决定**默认关掉**：猜出来的名字出现过两次错配
  //（把「七叶树王国的七名骑士」安到了 Sirotan 头上、把「新 Keroro军曹」安到了
  // Nezumi-kun 头上），这正是当初换成对照表要解决的问题。
  // 想要兜底就把这里改成 true —— 但请记住：猜错了不会有任何提示。
  var USE_YUC_FALLBACK = false;

  // 抓这一页最多等 5 秒。它实测 1 秒就回来，等更久只会拖慢整页。
  var TIMEOUT_MS = 5000;

  // 中文名表按「季」缓存，30 分钟内不重复抓（和每天数据的缓存时长一致）
  var CACHE_PREFIX = 'anime:v3:zh:';
  var TTL_MS = 30 * 60 * 1000;

  // 首播日期允许差几天。超过这个数就肯定不是同一部，直接排除。
  var START_DATE_TOLERANCE_DAYS = 5;

  // 时间允许差多少分钟。
  // 为什么是 45：yuc 写的是"预定档"，实测和实际上线最多差一小时，
  // 放宽到 45 分钟还能靠首播日期把大多数分清楚。
  var TIME_WINDOW_MINUTES = 45;

  // 实测：yuc 写的播出时间普遍比 AniList 的实际时间早 15–60 分钟
  //（它写的是"预定档"，AniList 记的是实际上线）。所以配对时统一往晚推 30 分钟。
  var OFFSET_MINUTES = 30;

  // 一对候选的分数上限。分数 = 时间差（分钟）+ 首播日差 × 10。
  // 超过这个数就说明两个信号都不太对得上，宁可不给中文名。
  var MAX_SCORE = 15;

  // 两对候选的分数差在这个范围内，就算「差不多像」——分不清，谁都不给
  var AMBIGUITY_MARGIN = 5;

  // 按首播日期配对时，时间允许差多少分钟（分钟）。
  // 日期已经对上了，时间只是防止把「同一天播的别的番」认成它，所以放得宽一点。
  var SAME_DATE_WINDOW_MINUTES = 180;

  var memory = {};    // 季号 -> { savedAt: 毫秒, entries: [...] }
  var pending = {};   // 季号 -> Promise，同一季正在抓的时候不重复抓
  var scratch = document.createElement('div');   // 解析标题时临时用（不挂到页面上）

  // ———————— 季号 ————————
  // 新番按 1/4/7/10 月分季，页面前缀是「年 + 月」，例如 2026 年 10 月 = 202610。
  function seasonOf(dayKey) {
    var parts = dayKey.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var startMonth = Math.floor((month - 1) / 3) * 3 + 1;   // 1、4、7、10
    return { year: year, month: startMonth, code: codeOf(year, startMonth) };
  }

  // 上一季。为什么要它：10 月初播的「夏季番」还挂在上一季的页面上，
  // 不并进来就会有几天查不到中文名。
  function previousSeason(season) {
    if (season.month === 1) {
      return { year: season.year - 1, month: 10, code: codeOf(season.year - 1, 10) };
    }
    return { year: season.year, month: season.month - 3, code: codeOf(season.year, season.month - 3) };
  }

  function codeOf(year, month) {
    return String(year) + (month < 10 ? '0' : '') + month;
  }

  // ———————— 抓页面 ————————
  function fetchHtml(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);

    return fetch(url, { signal: controller.signal }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error('yuc.wiki 返回 ' + res.status);
      }
      return res.text();
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('yuc.wiki 超时');
      }
      throw new Error('连不上 yuc.wiki');
    });
  }

  // ———————— 解析页面 ————————
  // 页面结构（每一季都一样）：
  //   <td class="date2">周二 (火)</td>           ← 换到下一个星期
  //   <div class="div_date">                     ← 一部番
  //     <p class="imgtext4">21:30~</p>            日本时间
  //     <p class="imgep">10/6~</p>                首播日期
  //   </div>
  //   旁边还有个 <td class="date_title_">中文名</td>
  var WEEK_CHARS = ['日', '一', '二', '三', '四', '五', '六'];   // 0 = 周日

  function parse(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var nodes = doc.querySelectorAll('.date2, .div_date');
    var entries = [];
    var weekday = -1;

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.classList.contains('date2')) {
        weekday = parseWeekday(node.textContent);
        continue;
      }
      if (weekday < 0) {
        continue;
      }
      var entry = readBlock(node, weekday);
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }

  function parseWeekday(text) {
    var found = /周([一二三四五六日])/.exec(text || '');
    if (!found) {
      return -1;
    }
    return WEEK_CHARS.indexOf(found[1]);
  }

  function readBlock(node, weekday) {
    var timeEl = node.querySelector('.imgtext4');
    var startEl = node.querySelector('.imgep');
    var block = node.parentElement;
    var titleEl = block ? block.querySelector('[class^="date_title"]') : null;
    if (!timeEl || !titleEl) {
      return null;
    }

    var time = parseTime(timeEl.textContent, weekday);
    if (!time) {
      return null;
    }
    var title = cleanTitle(titleEl);
    if (!title) {
      return null;
    }

    return {
      weekday: time.weekday,
      minutes: time.minutes,
      startMonth: parseStartDate(startEl ? startEl.textContent : '')[0],
      startDay: parseStartDate(startEl ? startEl.textContent : '')[1],
      title: title
    };
  }

  // '21:30~' / '25:30~'（25:30 = 次日 1:30）-> { weekday, minutes }
  function parseTime(text, weekday) {
    var found = /(\d{1,2}):(\d{2})/.exec(text || '');
    if (!found) {
      return null;
    }
    var total = Number(found[1]) * 60 + Number(found[2]);
    // 超过 24:00 的写法：算到第二天去，时间本身取模
    var dayOffset = Math.floor(total / 1440);
    return { weekday: (weekday + dayOffset) % 7, minutes: total % 1440 };
  }

  // '10/6~' -> [10, 6]；解析不出就给 [null, null]
  function parseStartDate(text) {
    var found = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(text || '');
    if (!found) {
      return [null, null];
    }
    return [Number(found[1]), Number(found[2])];
  }

  // 标题里可能有 <br>（两行），换成空格再取纯文本
  function cleanTitle(el) {
    scratch.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, ' ');
    return (scratch.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // ———————— 缓存一季的中文名表 ————————
  function readDisk(code) {
    try {
      var raw = window.localStorage.getItem(CACHE_PREFIX + code);
      if (!raw) {
        return null;
      }
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.entries) || (Date.now() - saved.savedAt > TTL_MS)) {
        window.localStorage.removeItem(CACHE_PREFIX + code);   // 过期就删掉
        return null;
      }
      return saved.entries;
    } catch (e) {
      return null;   // 存储被禁用或读坏了，当作没缓存
    }
  }

  function writeDisk(code, entries) {
    try {
      window.localStorage.setItem(CACHE_PREFIX + code, JSON.stringify({ savedAt: Date.now(), entries: entries }));
    } catch (e) {
      // 存不下就算了，内存里还有一份
    }
  }

  function loadSeason(season) {
    var fromMemory = memory[season.code];
    if (fromMemory && (Date.now() - fromMemory.savedAt <= TTL_MS)) {
      return Promise.resolve(fromMemory.entries);
    }

    var fromDisk = readDisk(season.code);
    if (fromDisk) {
      memory[season.code] = { savedAt: Date.now(), entries: fromDisk };
      return Promise.resolve(fromDisk);
    }

    if (pending[season.code]) {
      return pending[season.code];
    }

    pending[season.code] = fetchHtml(ORIGIN + season.code + '/').then(function (html) {
      delete pending[season.code];
      var entries = parse(html);
      memory[season.code] = { savedAt: Date.now(), entries: entries };
      writeDisk(season.code, entries);
      return entries;
    }).catch(function () {
      delete pending[season.code];
      return [];   // 抓不到 = 这季没有中文名，不算错误
    });

    return pending[season.code];
  }

  // 拿某一天所属那一季（外加上一季）的中文名表
  function getTable(dayKey) {
    var season = seasonOf(dayKey);
    var previous = previousSeason(season);
    return Promise.all([loadSeason(season), loadSeason(previous)]).then(function (both) {
      return both[0].concat(both[1]);
    });
  }

  // ———————— 对上号 ————————
  // AniList 的时间戳 -> 日本时间的「一周第几分钟」。
  // 用「一周第几分钟」而不是「几点几分」，是为了让 23:30 和次日 00:00 能直接相减
  //（跨午夜的那部番实测正好差 30 分钟，用普通时间算法会以为差了 23 个半小时）。
  function weekMinutesOfTimestamp(unixSeconds) {
    var date = new Date(unixSeconds * 1000);
    return date.getUTCDay() * 1440 + (date.getUTCHours() + 9) * 60 + date.getUTCMinutes();
  }

  // 两个首播日差几天；缺数据就返回 null
  function dayGap(entry, startDate) {
    if (!startDate || !startDate.year || !startDate.month || !startDate.day) {
      return null;
    }
    if (!entry.startMonth || !entry.startDay) {
      return null;
    }
    var a = Date.UTC(startDate.year, startDate.month - 1, startDate.day);
    var b = Date.UTC(startDate.year, entry.startMonth - 1, entry.startDay);
    return Math.abs(a - b) / 86400000;
  }

  // 把「AniList 的卡片」和「yuc 的一行」两两配成候选对，
  // 再从最像的一对开始逐个认领。
  // 为什么不是「一张卡片一张卡片地找」：那样先处理的卡片会把别人的中文名抢走
  //（实测同一分钟有三部番同时播，一张张找就会张冠李戴）。
  function buildPairs(list, table) {
    var pairs = [];

    for (var i = 0; i < list.length; i++) {
      var target = weekMinutesOfTimestamp(list[i].airingAt);
      for (var j = 0; j < table.length; j++) {
        var entry = table[j];
        var timeDiff = Math.abs(entry.weekday * 1440 + entry.minutes + OFFSET_MINUTES - target);
        if (timeDiff > TIME_WINDOW_MINUTES) {
          continue;
        }
        var gap = dayGap(entry, list[i].startDate);
        if (gap !== null && gap > START_DATE_TOLERANCE_DAYS) {
          continue;   // 首播日差太远，肯定不是同一部
        }

        // 分数越小越像。首播日期更可信（同一时刻有好几部番时只能看日期），
        // 所以日期差一天折 10 分，时间差一分钟才 1 分。
        var score = timeDiff + (gap === null ? 999 : gap * 10);
        if (score > MAX_SCORE) {
          continue;   // 两个信号都不够像，干脆不配
        }
        pairs.push({ item: i, entry: j, score: score });
      }
    }

    pairs.sort(function (a, b) {
      return a.score - b.score;
    });
    return pairs;
  }

  // 从本地对照表里查中文名。查不到返回空字符串。
  // 表在 data/titles-zh.js 里，键是字符串形式的 id（对象键本来就是字符串）。
  function fromTable(item) {
    var table = window.ZH_TITLES;
    if (!table || item.id === null || item.id === undefined) {
      return '';
    }
    var name = table[String(item.id)];
    return typeof name === 'string' ? name : '';
  }

  // 给一组卡片补上中文名（titleZh）。
  // 顺序很关键：**先查表**（准），表里没有再走 yuc 兜底（猜）。
  function attach(list, dayKey) {
    var rest = [];        // 表里没有的，才需要去猜
    var usedNames = {};   // 表里已经用掉的中文名，兜底时不许再用（否则同一页会出现两个同名）

    for (var i = 0; i < list.length; i++) {
      list[i].titleZh = '';   // 清掉缓存里可能带着的旧结果，避免叠在一起
      var known = fromTable(list[i]);
      if (known) {
        list[i].titleZh = known;
        usedNames[known] = true;
      } else {
        rest.push(list[i]);
      }
    }

    if (!rest.length || !USE_YUC_FALLBACK) {
      // 全都查到了（或者兜底被关掉）：连 yuc.wiki 都不用抓，打开更快
      return Promise.resolve(list);
    }

    return getTable(dayKey).then(function (table) {
      if (!table.length) {
        return list;   // 兜底表没抓到，就保持「只有罗马音」
      }
      matchTitles(rest, table, usedNames);
      return list;
    }).catch(function () {
      return list;   // 任何意外都不影响主要功能
    });
  }

  // 用 yuc 的中文名表去猜（只处理传进来的这些卡片，已经查到的不动它）
  function matchTitles(list, table, usedNames) {
    if (!list.length) {
      return;
    }

    var pairs = buildPairs(list, table);

    // 表里已经用掉的中文名，从候选里剔除：宁可没有，也不能两张卡片同名（那就是配错了）
    for (var q = pairs.length - 1; q >= 0; q--) {
      if (usedNames && usedNames[table[pairs[q].entry].title]) {
        pairs.splice(q, 1);
      }
    }

    var dropped = {};     // 分不清的卡片：宁可不给中文名
    var poisoned = {};    // 被分不清的卡片沾过的中文名：也不再分给别人
    var itemTaken = {};
    var entryTaken = {};

    // 第零步：先按「首播日期一模一样」配一轮。
    // 日期比时刻靠得住（实测 yuc 的档期时间和 AniList 的实际时间最多差一小时，
    // 但首播日期一般是一样的），所以先拿它把能确定的都定下来。
    var byDate = {};      // '月-日' -> [中文名序号]
    for (var b = 0; b < table.length; b++) {
      var key = table[b].startMonth + '-' + table[b].startDay;
      if (!byDate[key]) {
        byDate[key] = [];
      }
      byDate[key].push(b);
    }

    var claims = {};      // 中文名序号 -> [卡片序号]，用来看有没有两张卡片抢同一个
    var dateMatch = {};   // 卡片序号 -> 中文名序号（只在只有一个候选时才记）
    for (var ii = 0; ii < list.length; ii++) {
      var sd = list[ii].startDate;
      if (!sd || !sd.month || !sd.day) {
        continue;
      }
      var cands = byDate[sd.month + '-' + sd.day] || [];
      var only = -1;
      var howMany = 0;
      for (var cc = 0; cc < cands.length; cc++) {
        var ej = cands[cc];
        var tdiff = Math.abs(table[ej].weekday * 1440 + table[ej].minutes + OFFSET_MINUTES
          - weekMinutesOfTimestamp(list[ii].airingAt));
        if (tdiff <= SAME_DATE_WINDOW_MINUTES) {
          only = ej;
          howMany += 1;
        }
      }
      if (howMany === 1) {
        dateMatch[ii] = only;
        if (!claims[only]) {
          claims[only] = [];
        }
        claims[only].push(ii);
      }
    }

    for (var iw in dateMatch) {
      var ew = dateMatch[iw];
      if (claims[ew] && claims[ew].length === 1) {
        list[iw].titleZh = table[ew].title;
        itemTaken[iw] = true;
        entryTaken[ew] = true;
      }
    }

    // 第一步：找出「两张卡片抢同一个中文名」或「一张卡片有两个差不多的候选」
    for (var k = 0; k < pairs.length; k++) {
      var pair = pairs[k];
      if (dropped[pair.item] || itemTaken[pair.item] || entryTaken[pair.entry]) {
        continue;
      }

      for (var m = 0; m < pairs.length; m++) {
        var other = pairs[m];
        if (other === pair || dropped[other.item] || Math.abs(other.score - pair.score) > AMBIGUITY_MARGIN) {
          continue;
        }
        if (itemTaken[other.item] || entryTaken[other.entry]) {
          continue;
        }
        if (other.item === pair.item || other.entry === pair.entry) {
          dropped[pair.item] = true;
          dropped[other.item] = true;
          break;
        }
      }
    }

    // 第二步：被砍掉的卡片沾过的中文名也标脏，免得换个卡片再配错一次
    for (var a = 0; a < pairs.length; a++) {
      if (dropped[pairs[a].item]) {
        poisoned[pairs[a].entry] = true;
      }
    }

    // 第三步：从最像的一对开始认领，一个中文名只给一张卡片
    for (var p = 0; p < pairs.length; p++) {
      var cand = pairs[p];
      if (dropped[cand.item] || poisoned[cand.entry] || itemTaken[cand.item] || entryTaken[cand.entry]) {
        continue;
      }
      itemTaken[cand.item] = true;
      entryTaken[cand.entry] = true;
      list[cand.item].titleZh = table[cand.entry].title;
    }
  }

  window.Zh = {
    getTable: getTable,
    attach: attach
  };
})();
