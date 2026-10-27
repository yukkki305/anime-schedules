// api.js —— 跟 AniList 要数据。
// 一次请求拿「北京时间某一天」的全部播出安排，整理成卡片要的形状。

(function () {
  'use strict';

  var ENDPOINT = 'https://graphql.anilist.co';

  // 实测这条查询要 7 秒左右，冷启动更慢，所以超时给到 10 秒
  var TIMEOUT_MS = 10000;

  // 失败后的等待时间：第一次失败等 2 秒，第二次失败等 4 秒，再失败就放弃
  var RETRY_DELAYS_MS = [2000, 4000];

  var QUERY = [
    'query ($a: Int, $b: Int) {',
    '  Page(page: 1, perPage: 50) {',
    '    pageInfo { hasNextPage }',
    '    airingSchedules(airingAt_greater: $a, airingAt_lesser: $b, sort: TIME) {',
    '      airingAt',
    '      episode',
    '      media {',
    '        id',
    '        title { romaji native }',
    '        coverImage { large }',
    '        averageScore',
    '        format',
    '        episodes',
    '        countryOfOrigin',
    '        isAdult',
    '        siteUrl',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // 发一次请求。失败时抛出的错误是「给人看的中文」，直接可以显示到页面上。
  function postOnce(variables) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query: QUERY, variables: variables }),
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error('服务器返回 ' + res.status);
      }
      return res.json();
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('请求超时（' + Math.round(TIMEOUT_MS / 1000) + ' 秒没有响应）');
      }
      throw new Error('网络连不上 AniList');
    }).then(function (json) {
      if (json.errors && json.errors.length) {
        throw new Error('接口报错：' + json.errors[0].message);
      }
      return json.data.Page;
    });
  }

  // 带重试：失败后等一会儿再试，最多试 3 次（1 次 + 2 次重试）
  function postWithRetry(variables, onRetry) {
    var attempt = 0;

    function run() {
      attempt += 1;
      return postOnce(variables).catch(function (err) {
        if (attempt > RETRY_DELAYS_MS.length) {
          throw err;
        }
        var waitMs = RETRY_DELAYS_MS[attempt - 1];
        if (onRetry) {
          onRetry(attempt, waitMs, err);
        }
        return sleep(waitMs).then(run);
      });
    }

    return run();
  }

  // 接口的一条数据 -> 卡片要的一条数据
  function toCard(item) {
    var media = item.media;
    var romaji = media.title && media.title.romaji;
    var native = media.title && media.title.native;

    return {
      id: media.id,
      title: romaji || native || '（无标题）',
      airingAt: item.airingAt,
      timeText: window.Time.cardTime(item.airingAt),
      episodeText: item.episode ? '第 ' + item.episode + ' 集' : '集数待定',
      scoreText: media.averageScore ? '评分 ' + media.averageScore : '暂无评分',
      coverUrl: (media.coverImage && (media.coverImage.large || media.coverImage.medium)) || '',
      format: media.format || '',
      origin: media.countryOfOrigin || '',
      siteUrl: media.siteUrl || ''
    };
  }

  // 拿某一天（'2026-10-27'）的全部数据，返回 Promise<卡片数组>
  function fetchDay(dayKey, onRetry) {
    var range = window.Time.dayRange(dayKey);

    return postWithRetry({ a: range.start, b: range.end }, onRetry).then(function (page) {
      // 只要日本动画：
      //   countryOfOrigin === 'JP' 才是日本片，国漫（CN）之类一律不要；
      //   国家字段是空的（极少数）也不要，宁可少显示，也不要混进来源不明的。
      // 实测 2026-10-26~11-01 这一周：124 条里 108 条是 JP、16 条是 CN、0 条空值。
      var list = page.airingSchedules.filter(function (item) {
        return item.media && !item.media.isAdult && item.media.countryOfOrigin === 'JP';
      });
      return list.map(toCard);
    });
  }

  window.Api = {
    fetchDay: fetchDay
  };
})();
