/* theme.js —— B1 深色模式
 *
 * 职责只有三件事：
 *   1. 点右上角那颗圆按钮，浅色/深色来回切；
 *   2. 记住用户的选择（localStorage），下次打开还是这个主题；
 *   3. 用户没手动选过的时候，跟着系统的深色模式走（系统变了页面也跟着变）。
 *
 * 注意：真正「一开始用哪个主题」是在 index.html 的 <head> 里那段小脚本定的，
 * 因为必须赶在页面画出来之前决定，否则会白闪一下。这个文件只负责之后的交互。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'anime:theme';
  var root = document.documentElement;
  var btn = document.getElementById('themeToggle');
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // 用户手动选过没有？存的是 'light' / 'dark' 就算选过
  function savedTheme() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null; // 存不了就当没选过，功能降级但不报错
    }
  }

  function systemTheme() {
    return media && media.matches ? 'dark' : 'light';
  }

  // 页面此刻到底是什么主题，以 <html data-theme> 为准
  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // 按钮上的图标和提示文字要跟主题对上：深色时显示太阳（点了变浅色）
  function refreshButton() {
    if (!btn) return;
    var dark = currentTheme() === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.title = dark ? '切换到浅色' : '切换到深色';
    btn.setAttribute('aria-label', dark ? '切换到浅色' : '切换到深色');
  }

  function apply(theme, remember) {
    root.setAttribute('data-theme', theme);
    if (remember) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (e) {
        // 存不了就算了，本次浏览仍然生效
      }
    }
    refreshButton();
  }

  if (btn) {
    btn.addEventListener('click', function () {
      apply(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  // 用户没手动选过的时候，系统主题一变，页面跟着变
  if (media) {
    var onSystemChange = function () {
      if (!savedTheme()) {
        apply(systemTheme(), false);
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', onSystemChange);
    } else if (media.addListener) {
      media.addListener(onSystemChange); // 老浏览器
    }
  }

  refreshButton();
})();
