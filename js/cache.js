// cache.js —— 缓存「某一天的数据」，30 分钟内再看同一天就不用再请求 AniList。
//
// 关于「存在哪」：2026-10-27 实测，双击 index.html 打开（地址是 file://）时，
// 这台机器的 Edge/Chrome 允许用 localStorage，缓存能跨刷新保留。
// 但换浏览器或换安全设置后可能被禁用（会报 SecurityError），所以保留一层退路：
//   1. 优先存进 localStorage —— 正常情况下走这条，按 F5 刷新后缓存还在。
//   2. 存不进就退回内存 —— 页面开着期间照样有效，只是刷新后会清空。

(function () {
  'use strict';

  var PREFIX = 'anime:v4:day:';   // 带版本号：以后数据格式变了，把 v4 改成 v5，旧缓存自然失效
  // v1 → v2：v1 的缓存里混着国漫，过滤日本动画后旧缓存必须作废。
  // v2 → v3：卡片多了中文名（titleZh）。
  // v3 → v4：缓存里加存「首播日期」，因为从缓存里再配中文名时要用它区分
  //          （同一时间有好几部番，只靠时间会配错）。
  var SCHEMA = 4;                 // 和 PREFIX 里的版本号保持一致
  var TTL_MS = 30 * 60 * 1000;    // 缓存有效期：30 分钟

  // 只存卡片要用的字段，别把接口返回的一大坨全塞进去
  var FIELDS = [
    'id', 'title', 'titleZh', 'airingAt', 'timeText', 'episodeText',
    'scoreText', 'coverUrl', 'format', 'origin', 'siteUrl', 'startDate'
  ];

  var memory = {};   // 退路：{ '2026-10-27': { savedAt: 毫秒, list: [...] } }
  var useLocalStorage = detectLocalStorage();

  if (useLocalStorage) {
    dropLegacy();   // 顺手清掉 v1 时代留下的旧缓存（那些里面混着国漫）
  }

  function detectLocalStorage() {
    try {
      var probe = PREFIX + 'probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;   // 这个浏览器不给用 localStorage 时走这里（改用内存）
    }
  }

  // 旧版本（v1 含国漫、v2 没中文名、v3 没首播日期）的缓存键还占着空间，一次性删掉。
  // 注意只删「本项目的旧版本」，不碰 js/zh.js 存的中文名表（那是 anime:v3:zh:）。
  function dropLegacy() {
    var oldPrefixes = ['anime:v1:day:', 'anime:v2:day:', 'anime:v3:day:'];
    try {
      var keys = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (!k) {
          continue;
        }
        for (var p = 0; p < oldPrefixes.length; p++) {
          if (k.indexOf(oldPrefixes[p]) === 0) {
            keys.push(k);
            break;
          }
        }
      }
      for (var j = 0; j < keys.length; j++) {
        window.localStorage.removeItem(keys[j]);
      }
    } catch (e) {
      // 删不掉也不影响使用，下次再试
    }
  }

  function keyFor(dayKey) {
    return PREFIX + dayKey;
  }

  // 只留需要的字段，返回新数组（不改原数据）
  function slim(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var row = {};
      for (var j = 0; j < FIELDS.length; j++) {
        row[FIELDS[j]] = list[i][FIELDS[j]];
      }
      out.push(row);
    }
    return out;
  }

  // 检查一份缓存还能不能用
  function usable(saved) {
    return !!saved && saved.v === SCHEMA && Array.isArray(saved.list) && (Date.now() - saved.savedAt <= TTL_MS);
  }

  function readDisk(dayKey) {
    try {
      var raw = window.localStorage.getItem(keyFor(dayKey));
      if (!raw) {
        return null;
      }
      var saved = JSON.parse(raw);
      if (!usable(saved)) {
        window.localStorage.removeItem(keyFor(dayKey));   // 过期或格式不对，顺手删掉
        return null;
      }
      return saved.list;
    } catch (e) {
      return null;   // 缓存读坏了不能拖累主流程，当作没有缓存
    }
  }

  function writeDisk(dayKey, list) {
    var payload = JSON.stringify({ v: SCHEMA, savedAt: Date.now(), list: slim(list) });
    try {
      window.localStorage.setItem(keyFor(dayKey), payload);
      return true;
    } catch (e) {
      // 多半是浏览器存储满了：把所有旧缓存清掉再试一次
      try {
        clearAll();
        window.localStorage.setItem(keyFor(dayKey), payload);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function readMemory(dayKey) {
    var saved = memory[dayKey];
    if (!usable(saved)) {
      delete memory[dayKey];
      return null;
    }
    return saved.list.slice();
  }

  function writeMemory(dayKey, list) {
    memory[dayKey] = { v: SCHEMA, savedAt: Date.now(), list: slim(list) };
  }

  // 拿某一天的缓存；没有、过期、读坏了都返回 null
  function get(dayKey) {
    var fromDisk = useLocalStorage ? readDisk(dayKey) : null;
    if (fromDisk) {
      return fromDisk;
    }
    return readMemory(dayKey);
  }

  // 存某一天的数据（内存一定会存；浏览器允许的话再存一份到硬盘）
  function set(dayKey, list) {
    writeMemory(dayKey, list);
    if (useLocalStorage) {
      writeDisk(dayKey, list);
    }
    return true;
  }

  // 清空本项目写进去的所有缓存（不碰别的网站的存储）
  function clearAll() {
    memory = {};
    if (!useLocalStorage) {
      return;
    }
    try {
      var keys = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          keys.push(k);
        }
      }
      for (var j = 0; j < keys.length; j++) {
        window.localStorage.removeItem(keys[j]);
      }
    } catch (e) {
      // 清不掉也无所谓，下次写入时还会再试
    }
  }

  window.CacheStore = {
    get: get,
    set: set,
    clear: clearAll,
    persistent: useLocalStorage   // false = 只存在内存里，刷新就没了
  };
})();
