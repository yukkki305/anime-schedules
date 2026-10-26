// main.js —— 程序入口，页面一打开就跑这里。
// 阶段 1：只塞 3 条假数据进去，看看骨架长什么样。不联网、不读缓存。

(function () {
  'use strict';

  // 假数据。字段名先按「卡片要显示什么」来定，
  // 阶段 2 接真实接口时，把接口数据整理成同样的形状就能直接复用 ui.js。
  var fakeList = [
    {
      title: 'Mahou Shoujo Ikusei Keikaku: restart',
      timeText: '周二 01:00',
      episodeText: '第 4 集',
      scoreText: '暂无评分',
      coverColor: '#c7d2fe'
    },
    {
      title: 'Kyouran Reijou Nia Liston',
      timeText: '周二 20:26',
      episodeText: '第 4 集',
      scoreText: '评分 61',
      coverColor: '#fbcfe8'
    },
    {
      title: 'Chitose-kun wa Ramune Bin no Naka Part 2',
      timeText: '周二 22:00',
      episodeText: '第 3 集',
      scoreText: '评分 72',
      coverColor: '#bbf7d0'
    }
  ];

  window.UI.renderCards(fakeList);
})();
