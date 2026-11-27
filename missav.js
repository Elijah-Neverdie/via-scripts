// ==UserScript==
// @name         MissAV Via 辅助
// @namespace    missav-via-extra-button
// @version      1.10.0
// @description  单击开关控制条，双击快进快退，左右拖动调整进度，左滑调节视频亮度，右滑调节视频音量，长按拖动进度，左上角显示网速和视频真实分辨率，下载按钮左侧可上拉切换清晰度，“BTSOW”按钮搜索番号，视频下方“下载”弹出磁力下载列表
// @author       local
// @homepageURL  https://github.com/Elijah-Neverdie/via-scripts
// @updateURL    https://github.com/Elijah-Neverdie/via-scripts/releases/latest/download/missav.user.js
// @downloadURL  https://github.com/Elijah-Neverdie/via-scripts/releases/latest/download/missav.user.js
// @match        *://missav.ai/*
// @match        *://*.missav.ai/*
// @match        *://missav.com/*
// @match        *://*.missav.com/*
// @match        *://missav.ws/*
// @match        *://*.missav.ws/*
// @match        *://missav.live/*
// @match        *://*.missav.live/*
// @match        *://thisav.com/*
// @match        *://*.thisav.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var BTN_ATTR = "data-via-missav-extra";
  var BTN_ID = "via-missav-extra-btn";
  var STYLE_ID = "via-missav-extra-style";
  var AD_STYLE_ID = "via-missav-ad-style";
  var CTRL_ATTR = "data-via-missav-controls";
  var MAX_TRIES = 40;
  var TRY_EVERY_MS = 400;
  var nativeOpen = window.open;
  var playerClickUntil = 0;
  var playTimer = 0;
  var hijackToastShown = false;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function textOf(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  function compactText(el) {
    return textOf(el).replace(/\s+/g, "");
  }

  function isOurButton(el) {
    return el && (el.id === BTN_ID || el.getAttribute(BTN_ATTR) === "1");
  }

  function isMissavHost(host) {
    return /(^|\.)(missav\.(ai|com|ws|live|fans|media|movie)|thisav\.com)$/i.test(
      host || ""
    );
  }

  function parseUrl(url) {
    try {
      return new URL(String(url || ""), location.href);
    } catch (e) {
      return null;
    }
  }

  var AD_HOST_RE =
    /(myavlive|tsyndicate|exoclick|juicyads|doubleclick|googlesyndication|hilltopads|trafficjunky|adsterra|trackwilltrk|bit\.ly|adf\.ly|go2cloud)/i;

  function isAdUrl(url) {
    var u = parseUrl(url);
    if (!u) return AD_HOST_RE.test(String(url || ""));
    if (u.protocol === "javascript:" || u.href === "about:blank") return false;
    if (isMissavHost(u.hostname)) return false;
    if (AD_HOST_RE.test(u.hostname) || AD_HOST_RE.test(u.href)) return true;
    if (u.origin === location.origin) {
      return /\/(ad|ads|redirect|out|go|click|aff)(\b|\/|\.|$)/i.test(u.pathname);
    }
    return false;
  }

  function isSafeOpen(url) {
    if (!url) return false;
    var u = parseUrl(url);
    if (!u) return false;
    if (isAdUrl(url)) return false;
    return isMissavHost(u.hostname);
  }

  function inPlayer(node) {
    if (!node || !node.closest) return false;
    return Boolean(
      node.closest(
        "#player, #video, .player, video.player, [data-demo-player], .plyr, .jwplayer"
      )
    );
  }

  function shouldBlockNavNow(url) {
    if (isAdUrl(url)) return true;
    if (Date.now() > playerClickUntil) return false;
    var u = parseUrl(url);
    if (!u) return true;
    if (u.origin === location.origin) {
      return /\/(ad|ads|redirect|out|go|click|aff)(\b|\/|\.|$)/i.test(u.pathname);
    }
    return !isMissavHost(u.hostname);
  }

  function toast(message, isError) {
    ensureStyles();
    var el = document.getElementById("via-missav-toast");
    if (!el) {
      if (!document.body) return;
      el = document.createElement("div");
      el.id = "via-missav-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.setAttribute("data-state", isError ? "error" : "ok");
    el.style.display = "block";
    if (toast.timer) window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () {
      el.style.display = "none";
    }, 1800);
  }
  toast.timer = 0;

  function tryPlay() {
    var v = document.querySelector("video.player") || document.querySelector("#player video") || document.querySelector("video:not(.preview)");
    if (v && v.paused) {
      var maybe = v.play();
      if (maybe && maybe.catch) maybe.catch(function () {});
    }
    try {
      if (window.player && typeof window.player.play === "function") {
        window.player.play();
      }
    } catch (e) {}
    var demo = document.querySelector("[data-demo-player='1']");
    if (demo) {
      demo.classList.add("is-playing");
      var status = document.getElementById("play-status");
      if (status) status.textContent = "正在播放（已跳过广告）";
    }
  }

  function schedulePlay() {
    if (playTimer) window.clearTimeout(playTimer);
    playTimer = window.setTimeout(function () {
      tryPlay();
      if (!hijackToastShown) {
        hijackToastShown = true;
        toast("已跳过广告，直接播放");
      }
    }, 30);
  }

  function fakeClosedWindow() {
    return {
      closed: true,
      close: function () {},
      focus: function () {},
      blur: function () {},
      opener: null,
      location: { href: "about:blank" }
    };
  }

  function blockedOpen(url) {
    if (isSafeOpen(url) && !isAdUrl(url)) {
      try {
        return nativeOpen.apply(window, arguments);
      } catch (e) {
        return fakeClosedWindow();
      }
    }
    schedulePlay();
    return fakeClosedWindow();
  }

  function pageOpenHook() {
    if (window.__viaMissavOpenHook) return;
    window.__viaMissavOpenHook = true;
    var native = window.open;
    function fake() {
      return {
        closed: true,
        close: function () {},
        focus: function () {},
        blur: function () {},
        opener: null,
        location: { href: "about:blank" }
      };
    }
    function ownHost(host) {
      return /(^|\.)(missav\.(ai|com|ws|live|fans|media|movie)|thisav\.com)$/i.test(
        host || ""
      );
    }
    function shouldBlock(url) {
      if (!url) return true;
      try {
        var u = new URL(String(url), location.href);
        if (u.protocol === "javascript:" || u.href === "about:blank") return false;
        return !ownHost(u.hostname);
      } catch (e) {
        return true;
      }
    }
    function blocked(url) {
      if (!shouldBlock(url)) {
        try {
          return native.apply(window, arguments);
        } catch (e2) {
          return fake();
        }
      }
      try {
        if (window.player && typeof window.player.play === "function") {
          window.player.play();
        }
      } catch (e3) {}
      var v = document.querySelector("video.player") || document.querySelector("video:not(.preview)");
      if (v && v.paused && v.play) {
        var maybe = v.play();
        if (maybe && maybe.catch) maybe.catch(function () {});
      }
      return fake();
    }
    try {
      Object.defineProperty(window, "open", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: blocked
      });
    } catch (e4) {
      window.open = blocked;
    }
    window.setInterval(function () {
      if (window.open !== blocked) {
        try {
          window.open = blocked;
        } catch (e5) {}
      }
    }, 600);
  }

  function pageScriptNonce() {
    var nodes;
    var i;
    var nonce;
    try {
      nodes = document.querySelectorAll("script[nonce]");
    } catch (e) {
      return "";
    }
    for (i = 0; i < nodes.length; i++) {
      nonce = nodes[i].nonce || nodes[i].getAttribute("nonce") || "";
      if (nonce) return nonce;
    }
    return "";
  }

  function injectInlineScript(code) {
    var parent = document.documentElement || document.head;
    var script;
    var nonce;
    if (!parent) return;
    nonce = pageScriptNonce();
    script = document.createElement("script");
    if (nonce) {
      script.setAttribute("nonce", nonce);
      try {
        script.nonce = nonce;
      } catch (e) {}
    }
    script.textContent = code;
    parent.appendChild(script);
    if (script.parentNode) script.parentNode.removeChild(script);
  }

  function injectPageOpenHook() {
    var root = document.documentElement;
    if (!root) return;
    try {
      if (root.getAttribute("data-via-missav-hooked") !== "1") {
        root.setAttribute("data-via-missav-hooked", "1");
        injectInlineScript("(" + pageOpenHook.toString() + ")();");
      }
    } catch (e) {}
    try {
      pageOpenHook();
    } catch (e2) {}
  }

  function installOpenHook() {
    injectPageOpenHook();
    injectPageGestureHook();
    try {
      Object.defineProperty(window, "open", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: blockedOpen
      });
    } catch (e) {
      window.open = blockedOpen;
    }
    window.setInterval(function () {
      if (window.open !== blockedOpen) window.open = blockedOpen;
      injectPageOpenHook();
      injectPageGestureHook();
    }, 800);
  }

  function wrapLocationMethod(methodName) {
    try {
      var proto = Location.prototype;
      var original = proto[methodName];
      if (typeof original !== "function") return;
      var wrapped = function (url) {
        if (shouldBlockNavNow(url)) {
          schedulePlay();
          return;
        }
        return original.apply(this, arguments);
      };
      proto[methodName] = wrapped;
      try {
        Object.defineProperty(proto, methodName, {
          configurable: true,
          writable: true,
          value: wrapped
        });
      } catch (e2) {}
    } catch (e) {}
  }

  function installLocationHooks() {
    wrapLocationMethod("assign");
    wrapLocationMethod("replace");

    try {
      var desc = Object.getOwnPropertyDescriptor(Location.prototype, "href");
      if (desc && desc.set && desc.get) {
        Object.defineProperty(Location.prototype, "href", {
          configurable: true,
          get: function () {
            return desc.get.call(this);
          },
          set: function (v) {
            if (shouldBlockNavNow(v)) {
              schedulePlay();
              return;
            }
            desc.set.call(this, v);
          }
        });
      }
    } catch (e) {}

    try {
      var nav = window.navigation;
      if (nav && typeof nav.addEventListener === "function") {
        nav.addEventListener("navigate", function (event) {
          var dest = event.destination && event.destination.url;
          if (!dest || event.hashChange) return;
          if (!shouldBlockNavNow(dest)) return;
          try {
            if (event.cancelable) event.preventDefault();
          } catch (e2) {}
          schedulePlay();
        });
      }
    } catch (e) {}
  }

    function isPlayerChrome(node) {
    if (!node || !node.closest) return false;
    return Boolean(
      node.closest(
        ".plyr__controls, .plyr__menu, .plyr__progress, [" +
          CTRL_ATTR +
          "], #" +
          BTN_ID +
          ", #via-missav-seekbar"
      )
    );
  }

  function pageGestureHook() {
    var root = document.documentElement;
    if (root && root.getAttribute("data-via-missav-gesture-live") === "22") return;
    if (root) root.setAttribute("data-via-missav-gesture-live", "22");
    if (window.__viaMissavGestureHook === 22) return;
    window.__viaMissavGestureHook = 22;
    var SEEK = 15;
    var GAP = 280;
    var pending = 0;
    var lastTouch = 0;
    var lastTapX = 0;
    var lastTapY = 0;
    var lastAction = 0;
    var lastBtnTouch = 0;
    var uiShown = false;
    var userPlayed = false;
    var primed = false;
    var hideTimer = 0;
    var seekStreak = 0;
    var seekSide = "";
    var seekTimer = 0;
    var sideTimer = 0;
    var inlineArea = 0;
    var BRIGHT_KEY = "via-missav-video-bright";
    var BRIGHT_MIN = 0.15;
    var brightLevel = 1;
    var slide = null;
    var seekAcc = 0;
    var seekBase = 0;
    var seekCommitTimer = 0;
    var scrubSeekAt = 0;
    var scrubSeekTimer = 0;
    var scrubSeekTime = null;
    var longTimer = 0;
    var skipTap = 0;
    var thumbCues = null;
    var thumbLoading = false;
    var thumbKey = "";
    var thumbSheets = {};

    /* 页面里推荐卡片有一堆隐藏的预览 video，而且排在主播放器前面，必须明确选主视频 */
    function videoEl() {
      return (
        document.querySelector("video.player") ||
        document.querySelector("#player video") ||
        document.querySelector(".plyr video") ||
        document.querySelector("video:not(.preview)") ||
        document.querySelector("video")
      );
    }

    function playerRoot() {
      var v = videoEl();
      if (v && v.closest) {
        return v.closest(".plyr") || v.closest("#player") || v.closest("[data-demo-player]");
      }
      return document.querySelector(".plyr, #player");
    }

    function plyrEl() {
      var v = videoEl();
      if (v && v.closest) {
        return v.closest(".plyr");
      }
      return document.querySelector(".plyr");
    }

    function overlaidVisible(node) {
      var over = node && node.closest && node.closest(".plyr__control--overlaid");
      var cs;
      var rect;
      if (!over) return false;
      cs = window.getComputedStyle ? window.getComputedStyle(over) : null;
      if (cs) {
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (parseFloat(cs.opacity) === 0) return false;
      }
      rect = over.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8;
    }

    function chrome(node) {
      if (!node || !node.closest) return false;
      if (overlaidVisible(node)) return true;
      return Boolean(
        node.closest(
          ".plyr__controls,.plyr__menu,.plyr__progress,[data-via-missav-controls],#via-missav-extra-btn,#via-missav-seekbar,#via-missav-stats,#via-missav-quality-btn,#via-missav-quality"
        )
      );
    }

    function inPlayer(node) {
      if (!node || !node.closest) return false;
      return Boolean(
        node.closest("#player,#video,.player,video.player,[data-demo-player],.plyr,.jwplayer")
      );
    }

    function rememberPoint(event) {
      var t = event.changedTouches && event.changedTouches[0];
      if (t) {
        lastTapX = t.clientX;
        lastTapY = t.clientY;
        return;
      }
      if (typeof event.clientX === "number") lastTapX = event.clientX;
      if (typeof event.clientY === "number") lastTapY = event.clientY;
    }

    function fsNode() {
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      var plyr = document.querySelector(".plyr--fullscreen-active, .plyr--fullscreen-fallback");
      if (fs && fs.nodeType === 1 && fs.tagName !== "VIDEO") return fs;
      if (plyr) return plyr;
      if (fs && fs.parentElement && fs.parentElement !== document.body) return fs.parentElement;
      return null;
    }

    function scaleBox(rect, scale) {
      return {
        left: rect.left * scale,
        top: rect.top * scale,
        right: rect.right * scale,
        bottom: rect.bottom * scale,
        width: rect.width * scale,
        height: rect.height * scale
      };
    }

    function viewSize() {
      var vv = window.visualViewport;
      var width = window.innerWidth || 1;
      var height = window.innerHeight || 1;
      var left = 0;
      var top = 0;
      if (vv && vv.width > 0 && vv.height > 0) {
        width = vv.width;
        height = vv.height;
        left = vv.offsetLeft || 0;
        top = vv.offsetTop || 0;
      }
      return { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
    }

    function asCssBox(rect) {
      var dpr;
      var view;
      var widthRatio;
      if (!rect) return null;
      dpr = window.devicePixelRatio || 1;
      view = viewSize();
      if (dpr > 1 && rect.width > view.width * 1.25) {
        widthRatio = rect.width / dpr / view.width;
        if (widthRatio > 0.45 && widthRatio < 1.35) return scaleBox(rect, 1 / dpr);
      }
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    }

    function fitView(rect) {
      var view;
      var left;
      var top;
      var right;
      var bottom;
      var width;
      var height;
      if (!rect) return null;
      view = viewSize();
      left = Math.max(rect.left, view.left);
      top = Math.max(rect.top, view.top);
      right = Math.min(rect.right, view.right);
      bottom = Math.min(rect.bottom, view.bottom);
      width = right - left;
      height = bottom - top;
      if (width < 80 || height < 48) return null;
      return { left: left, top: top, right: right, bottom: bottom, width: width, height: height };
    }

    function pictureRect(el) {
      var node = el;
      var hops = 0;
      var best = null;
      var bestArea = 0;
      var rect;
      var ratio;
      var area;
      while (node && node !== document.body && hops < 8) {
        if (node.getBoundingClientRect) {
          rect = fitView(asCssBox(node.getBoundingClientRect()));
          if (rect) {
            ratio = rect.height / rect.width;
            if (ratio > 0.35 && ratio < 0.95) {
              area = rect.width * rect.height;
              if (area > bestArea) {
                best = rect;
                bestArea = area;
              }
            }
          }
        }
        node = node.parentElement;
        hops += 1;
      }
      return best;
    }

    function boxRect() {
      var v = videoEl();
      var fs = fsNode();
      var rect;
      var view;
      if (fs && fs.getBoundingClientRect) {
        rect = fitView(asCssBox(fs.getBoundingClientRect()));
        view = viewSize();
        if (rect && rect.width >= view.width * 0.7 && rect.height >= view.height * 0.7) return rect;
      }
      rect = pictureRect(v || playerRoot());
      if (rect) return rect;
      view = viewSize();
      return {
        left: view.left,
        top: view.top,
        right: view.right,
        bottom: view.bottom,
        width: view.width,
        height: view.height
      };
    }

    function asCssPoint(x, y, rect) {
      var dpr = window.devicePixelRatio || 1;
      var sx;
      var sy;
      if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) {
        return { x: x, y: y };
      }
      if (dpr > 1) {
        sx = x / dpr;
        sy = y / dpr;
        if (sx >= rect.left - 4 && sx <= rect.right + 4 && sy >= rect.top - 4 && sy <= rect.bottom + 4) {
          return { x: sx, y: sy };
        }
      }
      return { x: x, y: y };
    }

    function zoneFromPoint(x, y) {
      var rect = boxRect();
      var point = asCssPoint(x, y, rect);
      var width = rect.width || 1;
      var local = point.x - rect.left;
      if (local < 0) local = 0;
      if (local > width) local = width;
      if (local < width / 3) return "left";
      if (local > (width * 2) / 3) return "right";
      return "center";
    }

    function isPaused() {
      var player = window.player;
      var video = videoEl();
      if (player && typeof player.paused === "boolean") return player.paused;
      return !video || video.paused;
    }

    function disablePlyr() {
      var player = window.player;
      if (!player || !player.config) return;
      try {
        player.config.clickToPlay = false;
        player.config.hideControls = !uiShown;
        player.config.autoplay = false;
        player.config.doubleClickFullscreen = false;
        player.config.doubleClickToFullscreen = false;
      } catch (e) {}
    }

    function clampTime(time, duration) {
      if (time < 0) return 0;
      if (duration && isFinite(duration) && time > duration) return duration;
      return time;
    }

    function seekBy(delta) {
      queueSeek(delta);
    }

    function playNow() {
      var player = window.player;
      var video = videoEl();
      userPlayed = true;
      try {
        if (player && typeof player.play === "function") player.play();
      } catch (e) {}
      if (video && video.paused) {
        var maybe = video.play();
        if (maybe && maybe.catch) maybe.catch(function () {});
      }
    }

    function pauseNow() {
      var player = window.player;
      var video = videoEl();
      try {
        if (player && typeof player.pause === "function") player.pause();
      } catch (e) {}
      if (video && !video.paused) video.pause();
    }

    function togglePlay() {
      if (isPaused()) playNow();
      else pauseNow();
    }

    function isWatchPage() {
      var path = location.pathname || "";
      if (/\/[a-z]{2,14}-\d{2,6}/i.test(path)) return true;
      return Boolean(document.querySelector("#player video, video.player, .plyr video"));
    }

    function videoHost() {
      var v = videoEl();
      if (!v) return null;
      return (v.closest && (v.closest(".plyr__video-wrapper") || v.closest(".plyr") || v.closest("#player"))) || v.parentElement;
    }

    function removeLegacyLayer() {
      var dead = document.getElementById("via-missav-layer");
      if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
    }

    function injectStyle() {
      var style = document.getElementById("via-missav-gesture-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "via-missav-gesture-style";
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent =
        "#via-missav-layer{display:none!important;}" +
        ".plyr.via-ui-on .plyr__controls,.plyr.via-ui-on .plyr__controls[hidden]," +
        ".plyr.via-ui-on.plyr--hide-controls .plyr__controls," +
        ".plyr.via-ui-on.plyr--hide-controls .plyr__controls[hidden]{" +
        "display:flex!important;opacity:1!important;visibility:visible!important;" +
        "pointer-events:auto!important;transform:none!important;translate:none!important;}" +
        ".plyr__video-wrapper,video.player,#player video{touch-action:none;}" +
        "#via-missav-hud{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;overflow:visible;display:none;}" +
        "#via-missav-hud.via-hud-on{display:block;}" +
        "#via-missav-hud .via-side{position:absolute;top:0;bottom:0;width:33.333%;display:flex;align-items:center;justify-content:center;opacity:0;}" +
        "#via-missav-hud .via-side.left{left:0;}" +
        "#via-missav-hud .via-side.right{left:66.667%;}" +
        "#via-missav-hud .via-side.on{opacity:1!important;visibility:visible!important;animation:via-seek-fade .9s ease forwards;}" +
        "#via-missav-hud .via-face{position:relative;z-index:1;color:#fff;font-weight:400;letter-spacing:0;line-height:1;" +
        "padding:0;margin:0;border:0;border-radius:0;background:transparent;" +
        "text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.65);}" +
        "#via-missav-hud .via-level{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-weight:400;line-height:1.25;text-align:center;display:none;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.65);}" +
        "#via-missav-hud .via-level.on{display:block;}" +
        "#via-missav-hud .via-level.left{left:16%;}" +
        "#via-missav-hud .via-level.right{right:16%;}" +
        "#via-missav-hud .via-level b{display:block;font-weight:400;margin-top:6px;}" +
        "#via-missav-hud .via-scrub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;text-align:center;pointer-events:none;}" +
        "#via-missav-hud .via-scrub.on{display:block;}" +
        "#via-missav-hud .via-pip{display:none!important;}" +
        "#via-missav-hud .via-scrub-time{margin-top:8px;color:#fff;font-weight:400;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.65);}" +
        "#via-missav-hud .via-flash{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:72px;height:72px;border-radius:100%;background:rgba(0,0,0,.58);color:#fff;display:none;align-items:center;justify-content:center;}" +
        "#via-missav-hud .via-flash.on{display:flex;animation:via-play-pulse .4s ease;}" +
        "#via-missav-stats{position:fixed;left:0;top:0;width:0;height:0;z-index:2147482999;pointer-events:none;overflow:visible;display:none;}" +
        "#via-missav-stats.via-stats-on{display:block;}" +
        "#via-missav-stats .via-stats-box{position:absolute;left:0;top:0;padding:.34em .58em;display:flex;flex-direction:column;align-items:flex-start;" +
        "font-weight:400;line-height:1.2;text-align:left;letter-spacing:0;color:#ffd21e;" +
        "text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.85),0 0 10px rgba(0,0,0,.6);}" +
        "#via-missav-stats .via-stats-line{white-space:nowrap;}" +
        "#via-missav-stats .via-stat-quality{opacity:.92;margin-top:.06em;}" +
        "#via-missav-quality-btn{display:flex;align-items:center;justify-content:center;}" +
        "#via-missav-quality-btn svg{width:18px;height:18px;display:block;}" +
        "#via-missav-quality{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483100;pointer-events:none;overflow:visible;" +
        "visibility:hidden;transition:visibility 0s linear .24s;}" +
        "#via-missav-quality.via-q-open{visibility:visible;transition-delay:0s;}" +
        "#via-missav-quality .via-q-backdrop{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.38);" +
        "opacity:0;transition:opacity .2s ease;pointer-events:none;}" +
        "#via-missav-quality.via-q-open .via-q-backdrop{opacity:1;pointer-events:auto;}" +
        "#via-missav-quality .via-q-sheet{position:absolute;left:0;right:0;bottom:0;max-height:74%;overflow-y:auto;" +
        "-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:.35em 0 .45em;background:rgba(18,18,18,.96);" +
        "border-radius:12px 12px 0 0;box-shadow:0 -6px 22px rgba(0,0,0,.45);color:#fff;line-height:1.25;" +
        "transform:translateY(103%);transition:transform .22s ease;pointer-events:none;will-change:transform;}" +
        "#via-missav-quality.via-q-open .via-q-sheet{transform:translateY(0);pointer-events:auto;}" +
        "#via-missav-quality .via-q-head{position:relative;padding:.1em .95em .3em;user-select:none;-webkit-user-select:none;touch-action:none;}" +
        "#via-missav-quality .via-q-grab{display:block;width:2.4em;height:.26em;margin:0 auto .42em;border-radius:99px;background:rgba(255,255,255,.3);}" +
        "#via-missav-quality .via-q-title{display:block;font-size:.82em;color:rgba(255,255,255,.62);}" +
        "#via-missav-quality .via-q-list{display:flex;flex-direction:column;}" +
        "#via-missav-quality .via-q-item{appearance:none;-webkit-appearance:none;display:flex;align-items:center;" +
        "justify-content:space-between;gap:.8em;width:100%;box-sizing:border-box;margin:0;padding:.66em 1em;" +
        "background:transparent;border:0;color:#fff;font:inherit;text-align:left;line-height:1.25;}" +
        "#via-missav-quality .via-q-item:active{background:rgba(255,255,255,.07);}" +
        "#via-missav-quality .via-q-item.on{color:#ffd21e;}" +
        "#via-missav-quality .via-q-mark{font-size:.9em;opacity:0;}" +
        "#via-missav-quality .via-q-item.on .via-q-mark{opacity:1;}" +
        "#via-missav-seekbar{position:absolute;left:0;right:0;bottom:52px;z-index:6;display:none;justify-content:space-between;align-items:center;padding:0 8px 4px;pointer-events:auto;color:#fff;}" +
        ".plyr.via-ui-on #via-missav-seekbar,.plyr:not(.plyr--hide-controls) #via-missav-seekbar{display:flex!important;}" +
        "#via-missav-seekbar .via-seek-group{display:flex;align-items:center;gap:2px;}" +
        "#via-missav-seekbar button{appearance:none;-webkit-appearance:none;background:transparent;border:0;color:inherit;padding:6px 8px;margin:0;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:40px;line-height:1;}" +
        "#via-missav-seekbar button svg{display:block;}" +
        "#via-missav-seekbar button span{font-size:11px;margin-top:1px;opacity:.92;}" +
        "[data-via-missav-site-seek='1'],[data-via-missav-controls='1']{display:none!important;}" +
        "button[data-plyr='settings'] .via-dl{display:flex;align-items:center;justify-content:center;pointer-events:none;}" +
        "button[data-plyr='settings'] .via-dl svg{width:18px;height:18px;display:block;}" +
        "@keyframes via-seek-fade{0%{opacity:0}10%{opacity:1}65%{opacity:1}100%{opacity:0}}" +
        "@keyframes via-play-pulse{0%{transform:translate(-50%,-50%) scale(.82);opacity:.55}60%{transform:translate(-50%,-50%) scale(1.06);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}";
    }

    function chevrons(dir) {
      var i;
      var html = '<div class="via-chevrons">';
      for (i = 0; i < 3; i++) {
        html +=
          '<svg class="via-chev" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">' +
          (dir === "left"
            ? '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>'
            : '<path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>') +
          "</svg>";
      }
      return html + "</div>";
    }

    function playSvg() {
      return '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }

    function pauseSvg() {
      return '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    }

    function skipIcon(dir) {
      if (dir < 0) {
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.32 2.69A10 10 0 0 0 2.04 11h2.02a8 8 0 1 1 5.54 7.55l-.62 1.92A10 10 0 1 0 12.32 2.69zM8.4 12.4l6.3 3.6V8.8z"/></svg>';
      }
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5.68 2.69a10 10 0 0 1 10.28 8.31h-2.02A8 8 0 0 0 8.4 18.55l.62 1.92A10 10 0 0 1 5.68 2.69zM9.6 12.4L3.3 16V8.8z"/></svg>';
    }

    function bindPress(el, fn) {
      el.addEventListener(
        "touchend",
        function (event) {
          lastBtnTouch = Date.now();
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          fn();
        },
        { capture: true, passive: false }
      );
      el.addEventListener(
        "click",
        function (event) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (Date.now() - lastBtnTouch < 700) return;
          fn();
        },
        true
      );
    }

    function ensureSeekBar(host) {
      var bar = document.getElementById("via-missav-seekbar");
      var groups;
      var i;
      var btn;
      var spec;
      if (!host) return;
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "via-missav-seekbar";
        bar.setAttribute("data-via-missav-keep", "1");
        bar.innerHTML =
          '<div class="via-seek-group">' +
          '<button type="button" data-seek="-600">' + skipIcon(-1) + "<span>10m</span></button>" +
          '<button type="button" data-seek="-60">' + skipIcon(-1) + "<span>1m</span></button>" +
          '<button type="button" data-seek="-10">' + skipIcon(-1) + "<span>10s</span></button>" +
          "</div>" +
          '<div class="via-seek-group">' +
          '<button type="button" data-seek="10">' + skipIcon(1) + "<span>10s</span></button>" +
          '<button type="button" data-seek="60">' + skipIcon(1) + "<span>1m</span></button>" +
          '<button type="button" data-seek="600">' + skipIcon(1) + "<span>10m</span></button>" +
          "</div>";
        host.appendChild(bar);
        groups = bar.querySelectorAll("button");
        for (i = 0; i < groups.length; i++) {
          btn = groups[i];
          spec = parseInt(btn.getAttribute("data-seek"), 10);
          bindPress(
            btn,
            (function (delta) {
              return function () {
                seekBy(delta);
                scheduleHide();
              };
            })(spec)
          );
        }
      } else if (bar.parentElement !== host) {
        host.appendChild(bar);
      }
    }

    function labelRect() {
      var v = videoEl();
      var nodes = [];
      var i;
      var node;
      var raw;
      var ratio;
      var height;
      if (v) {
        nodes.push(v);
        if (v.closest) nodes.push(v.closest(".plyr__video-wrapper"));
      }
      nodes.push(document.querySelector(".plyr__video-wrapper"));
      for (i = 0; i < nodes.length; i++) {
        node = nodes[i];
        if (!node || !node.getBoundingClientRect) continue;
        raw = asCssBox(node.getBoundingClientRect());
        if (!raw || raw.width < 80 || raw.height < 40) continue;
        ratio = raw.height / raw.width;
        if (ratio >= 0.42 && ratio <= 0.78) return raw;
      }
      if (v && v.getBoundingClientRect) {
        raw = asCssBox(v.getBoundingClientRect());
        if (raw && raw.width >= 80) {
          height = raw.height;
          if (height > raw.width * 0.8 || height < raw.width * 0.4) height = (raw.width * 9) / 16;
          return {
            left: raw.left,
            top: raw.top,
            width: raw.width,
            height: height,
            right: raw.left + raw.width,
            bottom: raw.top + height
          };
        }
      }
      return null;
    }

    function hudMount() {
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      var active;
      if (fs && fs.nodeType === 1 && fs.tagName !== "VIDEO") return fs;
      active = document.querySelector(".plyr--fullscreen-active");
      if (active) return active;
      return document.body || document.documentElement;
    }

    function fixedOrigin(wrap) {
      var node = wrap.parentElement;
      var cs;
      var will;
      while (node && node !== document.documentElement) {
        cs = window.getComputedStyle ? window.getComputedStyle(node) : null;
        will = cs && cs.willChange ? cs.willChange : "";
        if (
          cs &&
          ((cs.transform && cs.transform !== "none") ||
            (cs.filter && cs.filter !== "none") ||
            will.indexOf("transform") !== -1)
        ) {
          return node.getBoundingClientRect();
        }
        node = node.parentElement;
      }
      return { left: 0, top: 0 };
    }

    function pinHud(wrap) {
      var picture = labelRect();
      var rect = picture || boxRect();
      var fs = fsNode();
      var scale;
      var faces;
      var i;
      var px;
      var origin;
      if (!wrap) return;
      if (!picture && rect.height > rect.width * 0.8) {
        rect = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.width * 9 / 16,
          right: rect.left + rect.width,
          bottom: rect.top + rect.width * 9 / 16
        };
      }
      if (!fs) {
        if (rect.width * rect.height >= 8000) inlineArea = rect.width * rect.height;
      }
      scale = 1;
      if (fs && inlineArea > 0) {
        scale = Math.sqrt((rect.width * rect.height) / inlineArea);
        if (scale < 1) scale = 1;
        if (scale > 8) scale = 8;
      }
      px = titlePx() * scale;
      faces = wrap.querySelectorAll(".via-face");
      for (i = 0; i < faces.length; i++) {
        faces[i].style.fontSize = px + "px";
        faces[i].style.fontWeight = "400";
      }
      origin = fixedOrigin(wrap);
      wrap.style.left = (rect.left - origin.left) + "px";
      wrap.style.top = (rect.top - origin.top) + "px";
      wrap.style.width = (rect.width || 0) + "px";
      wrap.style.height = (rect.height || 0) + "px";
      wrap.style.zIndex = "2147483646";
      wrap.style.transform = "translateZ(0)";
      wrap.classList.add("via-hud-on");
    }

    function titlePx() {
      var h1 = document.querySelector("h1");
      var px = 16;
      if (h1 && window.getComputedStyle) {
        px = parseFloat(window.getComputedStyle(h1).fontSize) || 16;
      }
      if (px < 12) px = 12;
      return px;
    }

    function hideHud() {
      var wrap = document.getElementById("via-missav-hud");
      if (!wrap) return;
      if (slide && slide.mode) return;
      if (wrap.querySelector(".via-level.on, .via-scrub.on")) return;
      wrap.classList.remove("via-hud-on");
      wrap.style.width = "0";
      wrap.style.height = "0";
    }

    function ensureOverlay() {
      var host;
      var wrap;
      var flash;
      var mount;
      removeLegacyLayer();
      wrap = document.getElementById("via-missav-hud");
      if (!isWatchPage()) {
        if (wrap) hideHud();
        return null;
      }
      host = plyrEl() || playerRoot();
      mount = hudMount();
      if (!mount) return null;
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "via-missav-hud";
        wrap.setAttribute("data-via-missav-keep", "1");
        mount.appendChild(wrap);
      } else if (wrap.parentElement !== mount) {
        mount.appendChild(wrap);
      }
      if (!wrap.querySelector(".via-side.left .via-face") || wrap.querySelector(".via-ripple")) {
        wrap.innerHTML =
          '<div class="via-side left"><div class="via-face"></div></div>' +
          '<div class="via-side right"><div class="via-face"></div></div>' +
          '<div class="via-flash" aria-hidden="true"></div>';
      }
      if (!wrap.querySelector(".via-scrub")) {
        wrap.insertAdjacentHTML(
          "beforeend",
          '<div class="via-level left"></div><div class="via-level right"></div>' +
            '<div class="via-scrub"><div class="via-scrub-time"></div></div>'
        );
      }
      flash = wrap.querySelector(".via-flash");
      if (flash && !flash.innerHTML) flash.innerHTML = playSvg();
      if (host) ensureSeekBar(host);
      return wrap;
    }

    /* ---- 画面左上角：实时网速 + 当前清晰度 ---- */

    var STAT_WINDOW = 1500;
    var statSamples = [];
    var statSawBytes = false;
    var statNetHooked = false;
    var statQualityCache = "";
    var statQualityAt = 0;
    var statEchoCache = "";
    var statEchoAt = 0;
    var statTimer = 0;

    function statAdd(bytes) {
      var now;
      var cut;
      var i;
      if (!(bytes > 0)) return;
      statSawBytes = true;
      now = Date.now();
      statSamples.push({ t: now, n: bytes });
      if (statSamples.length > 800) statSamples.splice(0, statSamples.length - 800);
      cut = 0;
      for (i = 0; i < statSamples.length; i++) {
        if (now - statSamples[i].t <= STAT_WINDOW) break;
        cut = i + 1;
      }
      if (cut > 0) statSamples.splice(0, cut);
    }

    function statRate() {
      var now = Date.now();
      var total = 0;
      var i;
      var sample;
      var span;
      var first = -1;
      for (i = 0; i < statSamples.length; i++) {
        sample = statSamples[i];
        if (now - sample.t > STAT_WINDOW) continue;
        if (first < 0) first = sample.t;
        total += sample.n;
      }
      if (total <= 0 || first < 0) return 0;
      span = now - first;
      if (span < 600) span = 600;
      if (span > STAT_WINDOW) span = STAT_WINDOW;
      return total / (span / 1000);
    }

    function statFormat(rate) {
      var kb;
      var mb;
      if (!(rate > 0) || !isFinite(rate)) return "0 B/s";
      mb = rate / 1048576;
      if (mb >= 1) return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + " MB/s";
      kb = rate / 1024;
      if (kb >= 1) return (kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)) + " KB/s";
      return Math.round(rate) + " B/s";
    }

    function statBandwidth() {
      var hls = hlsOf();
      var est;
      if (!hls) return 0;
      try {
        est = hls.bandwidthEstimate;
      } catch (e) {
        est = 0;
      }
      if (!(est > 0)) return 0;
      return est / 8;
    }

    function statSpeedText() {
      var rate = statRate();
      if (!rate && !statSawBytes) rate = statBandwidth();
      return statFormat(rate);
    }

    function statHookNet() {
      var proto;
      var origOpen;
      var origSend;
      var origFetch;
      if (statNetHooked) return;
      statNetHooked = true;
      try {
        proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
        if (proto && typeof proto.send === "function" && typeof proto.open === "function") {
          origOpen = proto.open;
          origSend = proto.send;
          proto.open = function () {
            try {
              this.__viaStatLoaded = 0;
            } catch (e) {}
            return origOpen.apply(this, arguments);
          };
          proto.send = function () {
            var xhr = this;
            try {
              xhr.addEventListener("progress", function (event) {
                var loaded = (event && event.loaded) || 0;
                var prev = xhr.__viaStatLoaded || 0;
                if (loaded > prev) {
                  xhr.__viaStatLoaded = loaded;
                  statAdd(loaded - prev);
                }
              });
              xhr.addEventListener("load", function () {
                var size = 0;
                var prev = xhr.__viaStatLoaded || 0;
                try {
                  if (xhr.response && xhr.response.byteLength) size = xhr.response.byteLength;
                  else if (xhr.response && xhr.response.size) size = xhr.response.size;
                } catch (e1) {
                  size = 0;
                }
                if (size > prev) {
                  xhr.__viaStatLoaded = size;
                  statAdd(size - prev);
                }
              });
            } catch (e2) {}
            return origSend.apply(this, arguments);
          };
        }
      } catch (e3) {}
      try {
        if (typeof window.fetch === "function") {
          origFetch = window.fetch;
          window.fetch = function (input) {
            var url = typeof input === "string" ? input : (input && input.url) || "";
            var call = origFetch.apply(this, arguments);
            if (!/\.(ts|m4s|mp4|m4v|m4a|aac)(\?|#|$)/i.test(url)) return call;
            return call.then(function (response) {
              try {
                if (
                  response &&
                  typeof response.clone === "function" &&
                  response.body &&
                  typeof response.body.getReader === "function"
                ) {
                  var reader = response.clone().body.getReader();
                  var pump = function () {
                    reader.read().then(function (chunk) {
                      if (chunk && !chunk.done) {
                        if (chunk.value && chunk.value.byteLength) statAdd(chunk.value.byteLength);
                        pump();
                      }
                    }, function () {});
                  };
                  pump();
                }
              } catch (e) {}
              return response;
            });
          };
        }
      } catch (e4) {}
    }

    function statQualityLabel(raw) {
      var text = String(raw || "").replace(/\s+/g, " ").trim();
      var match;
      if (!text || text.length > 12) return "";
      if (/^(自动|自動|auto)$/i.test(text)) return "自动";
      match = /^(\d{3,4})\s*[pP]$/.exec(text);
      if (match) return match[1] + "P";
      return "";
    }

    /* 站点常用的文字档位（原画/高清/标清…）：只作为可点击选项，不参与 hls 层级映射 */
    function statQualityAlias(raw) {
      var text = String(raw || "").replace(/\s+/g, " ").trim();
      var direct = statQualityLabel(text);
      if (direct) return direct;
      if (!text || text.length > 14) return "";
      if (/^(4k|uhd|2160p)$/i.test(text)) return "4K";
      if (/^(2k|qhd|1440p)$/i.test(text)) return "2K";
      if (/^(fhd|全高清)$/i.test(text)) return "FHD";
      if (/^(hd|高清|高清版|超清)$/i.test(text)) return "高清";
      if (/^(sd|标清)$/i.test(text)) return "标清";
      if (/^(流畅|流暢|ld)$/i.test(text)) return "流畅";
      if (/^(原画|原畫|蓝光|藍光|blu-?ray|original)$/i.test(text)) return "原画";
      return "";
    }

    function statChosen(node) {
      var el = node;
      var hops = 0;
      var attr;
      var cls;
      var sel;
      while (el && hops < 3) {
        if (el.tagName === "OPTION") {
          if (el.selected === true) return true;
          sel = el.parentElement;
          if (sel && sel.selectedIndex >= 0 && sel.options && sel.options[sel.selectedIndex] === el) return true;
        }
        if (el.getAttribute) {
          attr =
            el.getAttribute("aria-checked") ||
            el.getAttribute("aria-selected") ||
            el.getAttribute("aria-current") ||
            el.getAttribute("data-active");
          if (attr === "true") return true;
        }
        cls = el.className && el.className.toString ? el.className.toString() : "";
        if (!cls && el.getAttribute) cls = el.getAttribute("class") || "";
        if (/(^|[\s_-])(active|selected|current|checked|is-active|is-selected)([\s_-]|$)/i.test(cls)) return true;
        el = el.parentElement;
        hops += 1;
      }
      return false;
    }

    /* 自己注入的元素永不参与识别 */
    function statOwnNode(node) {
      var el = node;
      var hops = 0;
      var id;
      while (el && hops < 6) {
        id = el.id || (el.getAttribute ? el.getAttribute("id") : "") || "";
        if (String(id).indexOf("via-missav") === 0) return true;
        if (el.closest && el.closest("#via-missav-quality,#via-missav-quality-btn,#via-missav-stats")) return true;
        el = el.parentElement;
        hops += 1;
      }
      return false;
    }

    function statLabelOf(el) {
      var label = statQualityAlias(el.textContent);
      if (label) return label;
      if (el.tagName === "INPUT") {
        label = statQualityAlias(el.value);
        if (label) return label;
        if (el.parentElement) return statQualityAlias(el.parentElement.textContent);
      }
      return "";
    }

    function statQualityScopes() {
      var scopes = [];
      var menus;
      var i;
      var root = plyrEl() || playerRoot();
      if (root) scopes.push(root);
      try {
        menus = document.querySelectorAll(
          '[class*="quality"],[class*="resolution"],[class*="清晰"],[class*="畫質"],[class*="画质"],' +
            '[class*="setting"],[class*="menu"],[id*="quality"],[id*="resolution"]'
        );
        for (i = 0; i < menus.length && scopes.length < 12; i++) {
          if (statOwnNode(menus[i])) continue;
          scopes.push(menus[i]);
        }
      } catch (e) {}
      return scopes;
    }

    /*
     * 只认「同一个父节点下至少两个档位」的候选列表。
     * 设置面板里那一行当前值回显（例如齿轮菜单主面板上的 “360P”）是孤立节点，
     * 会在这里被排除，避免把回显当成完整菜单。
     */
    function statQualityListOf(scope) {
      var groups = [];
      var nodes;
      var out = [];
      var i;
      var g;
      var node;
      var parent;
      var label;
      var group;
      var entry;
      var best = null;
      if (!scope || !scope.querySelectorAll) return out;
      try {
        nodes = scope.querySelectorAll(
          "button, li, a, option, input, [role='option'], [role='menuitem'], [role='menuitemradio'], [role='radio']"
        );
      } catch (e) {
        return out;
      }
      for (i = 0; i < nodes.length; i++) {
        node = nodes[i];
        if (statOwnNode(node)) continue;
        label = statLabelOf(node);
        if (!label) continue;
        parent = node.parentElement;
        if (!parent) continue;
        group = null;
        for (g = 0; g < groups.length; g++) {
          if (groups[g].parent === parent) {
            group = groups[g];
            break;
          }
        }
        if (!group) {
          group = { parent: parent, items: [], seen: {} };
          groups.push(group);
        }
        if (group.seen[label]) {
          if (statChosen(node)) group.seen[label].chosen = true;
          continue;
        }
        entry = { label: label, node: node, chosen: statChosen(node) };
        group.seen[label] = entry;
        group.items.push(entry);
      }
      for (i = 0; i < groups.length; i++) {
        if (groups[i].items.length < 2) continue;
        if (!best || groups[i].items.length > best.items.length) best = groups[i];
      }
      return best ? best.items : out;
    }

    function statQualityMenu() {
      var scopes = statQualityScopes();
      var best = null;
      var bestScore = -1;
      var list;
      var score;
      var i;
      var j;
      for (i = 0; i < scopes.length; i++) {
        list = statQualityListOf(scopes[i]);
        if (list.length < 2) continue;
        score = list.length;
        for (j = 0; j < list.length; j++) {
          if (list[j].chosen) {
            score += 100;
            break;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = list;
        }
      }
      return best || [];
    }

    /* 站点自己的「当前清晰度」文字提示（低优先级，只在拿不到真实层级时兜底） */
    function statQualityEcho() {
      var scope = plyrEl() || playerRoot();
      var nodes;
      var row;
      var val;
      var i;
      if (!scope || !scope.querySelectorAll) return "";
      try {
        nodes = scope.querySelectorAll(".plyr__menu__value");
        for (i = 0; i < nodes.length; i++) {
          row = nodes[i].parentElement;
          while (row && row !== scope) {
            if (row.getAttribute && row.getAttribute("data-plyr-menu")) break;
            row = row.parentElement;
          }
          if (row && row !== scope && !/清晰|畫質|画质|quality|解像|分辨率|resolution/i.test(row.textContent || "")) {
            continue;
          }
          val = statQualityLabel(nodes[i].textContent);
          if (val) return val;
        }
        nodes = scope.querySelectorAll("select");
        for (i = 0; i < nodes.length; i++) {
          if (!nodes[i].options || nodes[i].selectedIndex < 0) continue;
          val = statQualityLabel(nodes[i].options[nodes[i].selectedIndex].textContent || "");
          if (val) return val;
        }
      } catch (e) {}
      return "";
    }

    function statQualityFromDom() {
      var chosen = statQualityMenuChosen();
      if (chosen) return chosen;
      return statQualityEcho();
    }

    /* 站点菜单里明确标出的选中项（只在真的是「一个档位列表」时才认） */
    function statQualityMenuChosen() {
      var menu = statQualityMenu();
      var i;
      for (i = 0; i < menu.length; i++) {
        if (menu[i].chosen) return menu[i].label;
      }
      return "";
    }

    /* Plyr 自带 quality 配置：齿轮里那些「hls 层级里没有」的档位通常来自这里 */
    function statPlyrLevels() {
      var player = window.player;
      var cfg = player && player.options ? player.options.quality : null;
      var options = cfg && cfg.options;
      var out = [];
      var i;
      var value;
      if (!options || !options.length) return out;
      for (i = 0; i < options.length; i++) {
        value = parseInt(options[i], 10);
        if (!(value > 0)) continue;
        out.push(value);
      }
      return out;
    }

    function statPlyrQuality() {
      var player = window.player;
      var cur;
      if (!statPlyrLevels().length || !player) return "";
      cur = player.quality;
      if (typeof cur !== "number" || !(cur > 0)) return "";
      return cur + "P";
    }

    function statHeightOfLabel(label) {
      var match = /^(\d{3,4})P$/.exec(label || "");
      return match ? parseInt(match[1], 10) : 0;
    }

    function levelHeight(level) {
      var height;
      if (!level) return 0;
      height = level.height || 0;
      if (!height && level.attrs && level.attrs.RESOLUTION) {
        height = parseInt(String(level.attrs.RESOLUTION).split("x")[1], 10) || 0;
      }
      return height;
    }

    function statPlaying() {
      var hls = hlsOf();
      var auto = false;
      var index = -1;
      var height = 0;
      var video;
      if (hls) {
        try {
          auto = hls.autoLevelEnabled === true;
          index = hls.currentLevel;
          if (!(index >= 0)) index = hls.loadLevel;
          if (!(index >= 0)) index = hls.nextLevel;
          if (index >= 0 && hls.levels && hls.levels[index]) height = levelHeight(hls.levels[index]);
        } catch (e) {}
      }
      if (!height) {
        video = videoEl();
        if (video && video.videoHeight > 0) height = video.videoHeight;
      }
      return { auto: auto, height: height };
    }

    /* 左上角只显示画面真实解码高度（例如 928P）；还没有尺寸时才退回 hls 当前层级 */
    function statQualityText() {
      var video = videoEl();
      var height;
      if (qPick && qPick.video && video && video !== qPick.video) qPick = null;
      height = video && video.videoHeight > 0 ? video.videoHeight : statPlaying().height;
      return height > 0 ? height + "P" : "";
    }

    function ensureStats() {
      var mount = hudMount();
      var wrap;
      if (!mount) return null;
      wrap = document.getElementById("via-missav-stats");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "via-missav-stats";
        wrap.setAttribute("data-via-missav-keep", "1");
        wrap.innerHTML =
          '<div class="via-stats-box">' +
          '<div class="via-stats-line via-stat-speed"></div>' +
          '<div class="via-stats-line via-stat-quality"></div>' +
          "</div>";
        mount.appendChild(wrap);
      } else if (wrap.parentElement !== mount) {
        mount.appendChild(wrap);
      }
      return wrap;
    }

    function pictureBox() {
      var picture = labelRect();
      var rect;
      var fs;
      var scale = 1;
      if (picture) {
        rect = picture;
      } else if (videoEl()) {
        rect = boxRect();
      } else {
        rect = null;
      }
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
      if (!picture && rect.height > rect.width * 0.8) {
        rect = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: (rect.width * 9) / 16,
          right: rect.left + rect.width,
          bottom: rect.top + (rect.width * 9) / 16
        };
      }
      fs = fsNode();
      if (!fs && rect.width * rect.height >= 8000) inlineArea = rect.width * rect.height;
      if (fs && inlineArea > 0) {
        scale = Math.sqrt((rect.width * rect.height) / inlineArea);
        if (scale < 1) scale = 1;
        if (scale > 8) scale = 8;
      }
      return { rect: rect, scale: scale };
    }

    function pinBox(wrap, box) {
      var origin;
      if (!wrap || !box) return;
      origin = fixedOrigin(wrap);
      wrap.style.left = box.rect.left - origin.left + "px";
      wrap.style.top = box.rect.top - origin.top + "px";
      wrap.style.width = (box.rect.width || 0) + "px";
      wrap.style.height = (box.rect.height || 0) + "px";
    }

    function pinnedFont(el, scale, ratio, minPx) {
      var px;
      if (!el) return;
      px = Math.round(titlePx() * scale * ratio * 10) / 10;
      if (px < minPx) px = minPx;
      el.style.fontSize = px + "px";
    }

    function pinStats(wrap) {
      var box;
      var content;
      if (!wrap) return;
      box = pictureBox();
      if (!box) {
        wrap.classList.remove("via-stats-on");
        return;
      }
      content = wrap.querySelector(".via-stats-box");
      pinnedFont(content, box.scale, 0.78, 11);
      pinBox(wrap, box);
      wrap.classList.add("via-stats-on");
    }

    function paintStats() {
      var wrap;
      var speedEl;
      var qualityEl;
      var speed;
      var quality;
      if (!isWatchPage()) {
        wrap = document.getElementById("via-missav-stats");
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        statQualityCache = "";
        qPick = null;
        qMemoClear();
        if (qOpen) closeQuality();
        return;
      }
      wrap = ensureStats();
      if (!wrap) return;
      pinStats(wrap);
      speed = statSpeedText();
      quality = statQualityText() || "—";
      speedEl = wrap.querySelector(".via-stat-speed");
      qualityEl = wrap.querySelector(".via-stat-quality");
      if (speedEl && speedEl.textContent !== speed) speedEl.textContent = speed;
      if (qualityEl && qualityEl.textContent !== quality) qualityEl.textContent = quality;
    }

    /* ---- 下载按钮左侧：清晰度上拉栏 ---- */

    var qOpen = false;
    var qItems = [];
    var qSig = "";
    var qDrag = null;
    var qSeen = false;
    var qProbeAt = 0;
    var qProbeCount = 0;
    var qPick = null;
    var qHarvested = false;
    var qHarvestTries = 0;
    var qSuppress = false;
    var qMemoList = null;
    var qMemoAt = 0;

    function qEsc(text) {
      return String(text === null || text === undefined ? "" : text).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    }

    function qIcon() {
      return (
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        '<rect x="2.9" y="5.6" width="18.2" height="12.8" rx="2.3" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<text x="12" y="15.3" text-anchor="middle" font-size="7.6" font-weight="600" fill="currentColor">HD</text>' +
        "</svg>"
      );
    }

    function qLevels() {
      var hls = hlsOf();
      var out = [];
      var i;
      var height;
      if (!hls || !hls.levels) return out;
      try {
        for (i = 0; i < hls.levels.length; i++) {
          height = levelHeight(hls.levels[i]);
          if (!height) continue;
          out.push({ height: height, index: i });
        }
      } catch (e) {}
      return out;
    }

    function qLevelOf(levels, height) {
      var i;
      for (i = 0; i < levels.length; i++) {
        if (levels[i].height === height) return levels[i].index;
      }
      return -1;
    }

    function qMemoClear() {
      qMemoAt = 0;
      qMemoList = null;
    }

    /*
     * 档位来源三合一：
     *   1. hls 的全部层级（真实可播）
     *   2. 站点菜单里真正能点的档位（同一父节点下 ≥2 项才算菜单）
     *   3. Plyr 自带 quality 配置（齿轮里那些层级里没有的档位来自这里）
     */
    function qOptions() {
      var now = Date.now();
      var levels;
      var menu;
      var plyr;
      var items = [];
      var i;
      var j;
      var hit;
      var rank;
      var m;
      var h;
      if (qMemoList && now - qMemoAt < 500) return qMemoList;
      levels = qLevels();
      menu = statQualityMenu();
      plyr = statPlyrLevels();
      items.push({ label: "自动", height: 0, auto: true, level: -1, el: null });
      for (i = 0; i < levels.length; i++) {
        items.push({
          label: levels[i].height + "P",
          height: levels[i].height,
          auto: false,
          level: levels[i].index,
          el: null
        });
      }
      for (i = 0; i < menu.length; i++) {
        m = menu[i];
        if (m.label === "自动") {
          if (m.node && !items[0].el) items[0].el = m.node;
          continue;
        }
        h = statHeightOfLabel(m.label);
        hit = -1;
        if (h) {
          for (j = 1; j < items.length; j++) {
            if (items[j].height === h) {
              hit = j;
              break;
            }
          }
        }
        if (hit >= 0) {
          items[hit].label = m.label;
          if (m.node && !items[hit].el) items[hit].el = m.node;
          continue;
        }
        if (!h && !m.node) continue;
        items.push({ label: m.label, height: h, auto: false, level: -1, el: m.node || null });
      }
      for (i = 0; i < plyr.length; i++) {
        hit = -1;
        for (j = 1; j < items.length; j++) {
          if (items[j].height === plyr[i]) {
            hit = j;
            break;
          }
        }
        if (hit >= 0) continue;
        items.push({
          label: plyr[i] + "P",
          height: plyr[i],
          auto: false,
          level: -1,
          el: null,
          plyr: plyr[i]
        });
      }
      items.sort(function (a, b) {
        if (a.auto) return -1;
        if (b.auto) return 1;
        rank = (a.height ? 2 : 1) - (b.height ? 2 : 1);
        if (rank) return rank;
        return b.height - a.height;
      });
      if (items.length < 2) items = [];
      qMemoAt = now;
      qMemoList = items;
      return items;
    }

    function qAvailable() {
      var now;
      if (qSeen) return true;
      now = Date.now();
      if (now - qProbeAt >= 1000) {
        qProbeAt = now;
        qProbeCount = qOptions().length;
        if (qProbeCount >= 2) qSeen = true;
      }
      return qSeen;
    }

    function qCurrentIndex(items) {
      var dom;
      var playing;
      var i;
      if (qPick) {
        if (qPick.auto) return 0;
        for (i = 0; i < items.length; i++) {
          if (!items[i].auto && items[i].label === qPick.label) return i;
        }
        for (i = 0; i < items.length; i++) {
          if (!items[i].auto && qPick.height && items[i].height === qPick.height) return i;
        }
      }
      dom = statQualityFromDom();
      playing = statPlaying();
      if (dom) {
        if (/^自动$/.test(dom)) return 0;
        for (i = 0; i < items.length; i++) {
          if (!items[i].auto && items[i].label === dom) return i;
        }
      }
      if (playing.auto) return 0;
      for (i = 0; i < items.length; i++) {
        if (!items[i].auto && playing.height && items[i].height === playing.height) return i;
      }
      return -1;
    }

    function qSoftClick(el) {
      if (!el) return false;
      try {
        if (typeof el.click === "function") {
          el.click();
          return true;
        }
      } catch (e) {}
      try {
        if (el.dispatchEvent && window.MouseEvent) {
          el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
          return true;
        }
      } catch (e2) {}
      return false;
    }

    function qSetPlyrQuality(value, anyValue) {
      var player = window.player;
      var levels = statPlyrLevels();
      var i;
      var known = Boolean(anyValue);
      if (!player || !levels.length) return false;
      for (i = 0; i < levels.length; i++) {
        if (levels[i] === value) known = true;
      }
      if (!known) return false;
      try {
        player.quality = value;
        return true;
      } catch (e) {}
      return false;
    }

    function qApply(item) {
      var hls = hlsOf();
      var ok = false;
      if (!item) return false;
      if (item.auto) {
        if (hls) {
          try {
            hls.currentLevel = -1;
            ok = true;
          } catch (e) {}
        }
        if (item.el && qSoftClick(item.el)) ok = true;
        if (!ok && item.plyr !== undefined) ok = qSetPlyrQuality(item.plyr);
        /* Plyr 的 quality 里 0 表示交给自适应 */
        if (!ok) ok = qSetPlyrQuality(0, true);
        return ok;
      }
      if (item.level >= 0 && hls) {
        try {
          hls.currentLevel = item.level;
          ok = true;
        } catch (e2) {}
      }
      if (item.el && qSoftClick(item.el)) ok = true;
      if (!ok && item.plyr !== undefined) ok = qSetPlyrQuality(item.plyr);
      return ok;
    }

    function qSheetEl() {
      var wrap = document.getElementById("via-missav-quality");
      return wrap ? wrap.querySelector(".via-q-sheet") : null;
    }

    function ensureQualitySheet() {
      var mount;
      var wrap;
      var backdrop;
      var head;
      if (!isWatchPage()) return null;
      mount = hudMount();
      if (!mount) return null;
      wrap = document.getElementById("via-missav-quality");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "via-missav-quality";
        wrap.setAttribute("data-via-missav-keep", "1");
        wrap.innerHTML =
          '<div class="via-q-backdrop"></div>' +
          '<div class="via-q-sheet">' +
          '<div class="via-q-head"><span class="via-q-grab"></span><span class="via-q-title">清晰度</span></div>' +
          '<div class="via-q-list"></div>' +
          "</div>";
        backdrop = wrap.querySelector(".via-q-backdrop");
        if (backdrop) bindPress(backdrop, closeQuality);
        head = wrap.querySelector(".via-q-head");
        if (head) {
          head.addEventListener("touchstart", qDragStart, { capture: true, passive: true });
          head.addEventListener("touchmove", qDragMove, { capture: true, passive: false });
          head.addEventListener("touchend", qDragEnd, { capture: true, passive: true });
          head.addEventListener("touchcancel", qDragEnd, { capture: true, passive: true });
        }
        mount.appendChild(wrap);
      } else if (wrap.parentElement !== mount) {
        mount.appendChild(wrap);
      }
      return wrap;
    }

    function renderQuality() {
      var wrap = ensureQualitySheet();
      var list;
      var html = "";
      var i;
      var cur;
      var buttons;
      var active;
      if (!wrap) return;
      list = wrap.querySelector(".via-q-list");
      if (!list) return;
      qItems = qOptions();
      cur = qCurrentIndex(qItems);
      for (i = 0; i < qItems.length; i++) {
        html +=
          '<button type="button" class="via-q-item' +
          (i === cur ? " on" : "") +
          '" data-q="' +
          i +
          '"><span class="via-q-label">' +
          qEsc(qItems[i].label) +
          '</span><span class="via-q-mark">✓</span></button>';
      }
      if (html === qSig) return;
      qSig = html;
      list.innerHTML = html;
      buttons = list.querySelectorAll("button");
      for (i = 0; i < buttons.length; i++) {
        bindPress(
          buttons[i],
          (function (index) {
            return function () {
              chooseQuality(index);
            };
          })(i)
        );
      }
      active = list.querySelector(".via-q-item.on");
      if (active && active.scrollIntoView) {
        try {
          active.scrollIntoView({ block: "nearest" });
        } catch (e) {}
      }
    }

    function pinQuality(wrap) {
      var box;
      var content;
      if (!wrap || !qOpen) return;
      box = pictureBox();
      if (!box) return;
      content = wrap.querySelector(".via-q-sheet");
      pinnedFont(content, box.scale, 0.86, 13);
      pinBox(wrap, box);
    }

    function openQuality() {
      var wrap;
      var btn;
      var opts;
      var fired;
      if (!isWatchPage()) return;
      opts = qOptions();
      /* 档位太少时，先让播放器把自己的清晰度菜单生成出来再读一次 */
      if (opts.length < 2 && !qHarvested) {
        fired = maybeHarvest();
        qMemoClear();
        opts = qOptions();
        if (opts.length < 2 && fired) {
          downloadToast("正在读取清晰度，再点一次试试", false);
          return;
        }
      }
      if (opts.length < 2) {
        downloadToast("这个视频没有可选清晰度", true);
        return;
      }
      wrap = ensureQualitySheet();
      if (!wrap) return;
      renderQuality();
      qOpen = true;
      pinQuality(wrap);
      wrap.classList.add("via-q-open");
      btn = document.getElementById("via-missav-quality-btn");
      if (btn) btn.setAttribute("aria-expanded", "true");
      setUi(true);
    }

    function closeQuality() {
      var wrap = document.getElementById("via-missav-quality");
      var btn = document.getElementById("via-missav-quality-btn");
      var sheet;
      qOpen = false;
      qDrag = null;
      if (wrap) {
        wrap.classList.remove("via-q-open");
        sheet = wrap.querySelector(".via-q-sheet");
        if (sheet) sheet.style.removeProperty("transform");
      }
      if (btn) btn.setAttribute("aria-expanded", "false");
    }

    function toggleQuality() {
      if (qOpen) closeQuality();
      else openQuality();
    }

    function chooseQuality(index) {
      var item = qItems[index];
      closeQuality();
      if (qApply(item)) {
        /* 记住这次选择：左上角与列表选中态都以它为准 */
        qPick = { label: item.label, height: item.height || 0, auto: Boolean(item.auto), video: videoEl() };
        qMemoClear();
        window.setTimeout(function () {
          paintStats();
          renderQuality();
        }, 80);
        return;
      }
      downloadToast("这个清晰度切不了", true);
    }

    /*
     * 有些站点把清晰度子菜单做成「打开设置时才生成」，这时页面上根本读不到档位。
     * 于是静默点一次播放器自己的清晰度行（全程把面板藏起来，用户看不到），
     * 让播放器把菜单建出来，之后就能正常读取和切换了。
     */
    function qlMenuNodes(selector) {
      var out = [];
      try {
        out = document.querySelectorAll(selector);
      } catch (e) {
        out = [];
      }
      return out;
    }

    function qlFindRow() {
      var rows = qlMenuNodes("[data-plyr-menu]");
      var i;
      var key;
      for (i = 0; i < rows.length; i++) {
        if (/清晰|畫質|画质|quality|解像|分辨率|resolution/i.test(rows[i].textContent || "")) return rows[i];
      }
      for (i = 0; i < rows.length; i++) {
        key = String((rows[i].getAttribute && rows[i].getAttribute("data-plyr-menu")) || "").toLowerCase();
        if (key === "quality") return rows[i];
      }
      return null;
    }

    function qlHideMenu() {
      var panels = qlMenuNodes(".plyr__menu__container");
      var i;
      for (i = 0; i < panels.length; i++) panels[i].setAttribute("hidden", "");
    }

    function maybeHarvest() {
      var panels;
      var row;
      var settings;
      var fired = false;
      if (qHarvested) return false;
      if (!isWatchPage()) return false;
      qHarvestTries += 1;
      if (qHarvestTries > 4) {
        qHarvested = true;
        return false;
      }
      try {
        panels = qlMenuNodes(".plyr__menu__container");
        row = qlFindRow();
        if (!row && !panels.length) {
          qHarvested = true;
          return false;
        }
        qSuppress = true;
        if (!row) {
          settings = panels[0].parentNode ? panels[0].parentNode.querySelector("button[data-plyr='settings']") : null;
          if (!settings) settings = document.querySelector("button[data-plyr='settings']");
          if (settings && qSoftClick(settings)) fired = true;
          qlHideMenu();
          row = qlFindRow();
        }
        if (row && qSoftClick(row)) fired = true;
        qlHideMenu();
        qSuppress = false;
        qHarvested = true;
        qMemoClear();
        qProbeAt = 0;
        qProbeCount = 0;
        qSeen = false;
        if (qOpen) {
          window.setTimeout(function () {
            renderQuality();
          }, 60);
        }
        return fired;
      } catch (e) {
        qSuppress = false;
      }
      return false;
    }

    function qDragStart(event) {
      var touch = event && event.touches && event.touches[0];
      if (!touch) return;
      qDrag = { y: touch.clientY, dy: 0 };
    }

    function qDragMove(event) {
      var touch = event && event.touches && event.touches[0];
      var sheet;
      if (!qDrag || !touch) return;
      qDrag.dy = Math.max(0, touch.clientY - qDrag.y);
      sheet = qSheetEl();
      if (sheet) sheet.style.transform = "translateY(" + Math.round(qDrag.dy) + "px)";
      if (event.cancelable) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
    }

    function qDragEnd() {
      var sheet = qSheetEl();
      var dy;
      if (!qDrag) return;
      dy = qDrag.dy;
      qDrag = null;
      if (sheet) sheet.style.removeProperty("transform");
      if (dy > 56) closeQuality();
    }

    function ensureQualityButton() {
      var settings;
      var btn;
      if (!isWatchPage()) return null;
      settings = document.querySelector('button[data-plyr="settings"]');
      if (!settings || !settings.parentNode) return null;
      btn = document.getElementById("via-missav-quality-btn");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "via-missav-quality-btn";
        btn.type = "button";
        btn.className = "plyr__controls__item plyr__control";
        btn.setAttribute("data-via-missav-keep", "1");
        btn.setAttribute("aria-label", "清晰度");
        btn.setAttribute("aria-expanded", "false");
        btn.innerHTML = qIcon() + '<span class="plyr__tooltip">清晰度</span>';
        bindPress(btn, toggleQuality);
      }
      if (settings.previousElementSibling !== btn || btn.parentNode !== settings.parentNode) {
        settings.parentNode.insertBefore(btn, settings);
      }
      if (!qSeen && !qHarvested) maybeHarvest();
      if (qAvailable()) {
        btn.style.removeProperty("display");
      } else {
        btn.style.display = "none";
        if (qOpen) closeQuality();
      }
      return btn;
    }

    function flashPlay() {
      var wrap = ensureOverlay();
      var flash = wrap && wrap.querySelector(".via-flash");
      if (!flash) return;
      pinHud(wrap);
      flash.innerHTML = isPaused() ? playSvg() : pauseSvg();
      flash.classList.remove("on");
      void flash.offsetWidth;
      flash.classList.add("on");
      if (flashPlay.timer) window.clearTimeout(flashPlay.timer);
      flashPlay.timer = window.setTimeout(function () {
        flash.classList.remove("on");
        hideHud();
      }, 850);
    }

    function scheduleHide() {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = 0;
      if (!userPlayed || isPaused()) return;
      hideTimer = window.setTimeout(function () {
        if (!isPaused()) setUi(false);
      }, 3200);
    }

    function controlsEl() {
      var player = window.player;
      var root = plyrEl() || playerRoot();
      if (player && player.elements && player.elements.controls) return player.elements.controls;
      return root && root.querySelector(".plyr__controls");
    }

    function controlsVisible() {
      var root = plyrEl() || playerRoot();
      var bar = controlsEl();
      if (root && root.classList.contains("via-ui-on")) return true;
      if (bar) {
        if (bar.hidden) return false;
        if (bar.getAttribute("hidden") !== null) return false;
      }
      if (root) return !root.classList.contains("plyr--hide-controls");
      return uiShown;
    }

    function paintControls(shown) {
      var root = plyrEl() || playerRoot();
      var bar = controlsEl();
      if (root && root.classList) {
        if (shown) {
          root.classList.add("via-ui-on", "plyr--hover", "plyr--full-ui");
          root.classList.remove("plyr--hide-controls");
        } else {
          root.classList.remove("via-ui-on", "plyr--hover");
          root.classList.add("plyr--hide-controls");
        }
      }
      if (!bar) return;
      if (shown) {
        bar.hidden = false;
        bar.removeAttribute("hidden");
        bar.style.removeProperty("display");
        bar.style.setProperty("display", "flex", "important");
        bar.style.setProperty("opacity", "1", "important");
        bar.style.setProperty("visibility", "visible", "important");
        bar.style.setProperty("transform", "none", "important");
        bar.style.setProperty("pointer-events", "auto", "important");
      } else {
        bar.style.setProperty("opacity", "0", "important");
        bar.style.setProperty("pointer-events", "none", "important");
      }
    }

    function applyChrome(shown) {
      var player = window.player;
      paintControls(shown);
      if (!player || !player.config) return;
      try {
        player.config.hideControls = !shown;
        if (typeof player.toggleControls === "function") player.toggleControls(shown);
      } catch (e) {}
      paintControls(shown);
    }

    function watchPlyr() {
      var root = plyrEl();
      var player = window.player;
      if (root && !root.__viaUiWatch) {
        root.__viaUiWatch = true;
        new MutationObserver(function () {
          if (uiShown) paintControls(true);
        }).observe(root, { attributes: true, attributeFilter: ["class", "hidden"] });
      }
      if (!player || player.__viaUiEvents || typeof player.on !== "function") return;
      player.__viaUiEvents = true;
      try {
        player.on("controlshidden", function () {
          if (uiShown) paintControls(true);
        });
        player.on("controlsshown", function () {
          if (!uiShown) paintControls(false);
        });
      } catch (e) {}
    }

    function setUi(shown) {
      if (!isWatchPage()) return;
      uiShown = !!shown;
      ensureOverlay();
      watchPlyr();
      applyChrome(uiShown);
      window.setTimeout(function () {
        applyChrome(uiShown);
      }, 40);
      window.setTimeout(function () {
        applyChrome(uiShown);
      }, 200);
      if (uiShown) scheduleHide();
    }

    function flashSeek(side) {
      var wrap = ensureOverlay();
      var panel;
      var face;
      var amount;
      var sides;
      var s;
      if (!wrap) return;
      pinHud(wrap);
      if (seekSide !== side) seekStreak = 0;
      seekSide = side;
      seekStreak += 1;
      amount = SEEK * seekStreak;
      panel = wrap.querySelector(".via-side." + side);
      face = panel && panel.querySelector(".via-face");
      if (face) {
        face.textContent = (side === "left" ? "-" : "+") + amount + "s";
        face.style.setProperty("opacity", "1", "important");
        face.style.setProperty("visibility", "visible", "important");
      }
      sides = wrap.querySelectorAll(".via-side");
      for (s = 0; s < sides.length; s++) sides[s].classList.remove("on");
      if (panel) {
        void panel.offsetWidth;
        panel.classList.add("on");
        panel.style.setProperty("opacity", "1", "important");
      }
      if (sideTimer) window.clearTimeout(sideTimer);
      sideTimer = window.setTimeout(function () {
        sides = wrap.querySelectorAll(".via-side");
        for (s = 0; s < sides.length; s++) {
          sides[s].classList.remove("on");
          sides[s].style.removeProperty("opacity");
        }
        hideHud();
      }, 900);
      if (seekTimer) window.clearTimeout(seekTimer);
      seekTimer = window.setTimeout(function () {
        seekStreak = 0;
        seekSide = "";
      }, 900);
    }

    function hookVideo() {
      var video = videoEl();
      if (!video || video.__viaUiHook) return;
      video.__viaUiHook = true;
      video.addEventListener("play", function () {
        userPlayed = true;
        scheduleHide();
      });
      video.addEventListener("pause", function () {
        if (userPlayed) setUi(true);
      });
    }

    function apply(side) {
      lastAction = Date.now();
      ensureOverlay();
      if (side === "left") {
        if (!userPlayed) playNow();
        seekBy(-SEEK);
        flashSeek("left");
        return;
      }
      if (side === "right") {
        if (!userPlayed) playNow();
        seekBy(SEEK);
        flashSeek("right");
        return;
      }
      togglePlay();
      window.setTimeout(function () {
        flashPlay();
        setUi(true);
      }, 0);
    }

    function onTap(event) {
      if (!isWatchPage()) return;
      if (Date.now() < skipTap) return;
      if (chrome(event.target) || !inPlayer(event.target)) return;
      if (event.type === "touchend" && event.touches && event.touches.length) return;
      rememberPoint(event);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
        apply(zoneFromPoint(lastTapX, lastTapY));
        return;
      }
      pending = window.setTimeout(function () {
        pending = 0;
        setUi(!controlsVisible());
      }, GAP);
    }

    function onDblClick(event) {
      if (!isWatchPage()) return;
      if (Date.now() - lastTouch < 800) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (chrome(event.target) || !inPlayer(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (Date.now() - lastAction < 400) return;
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
      }
      rememberPoint(event);
      apply(zoneFromPoint(lastTapX, lastTapY));
    }

    function rememberMedia(url) {
      var text = String(url || "");
      if (!text || text.indexOf("blob:") === 0) return;
      if (!/^https?:/i.test(text)) return;
      window.__viaMediaUrl = text;
    }

    function hookHls() {
      var Hls = window.Hls;
      var origLoad;
      var origAttach;
      if (!Hls || !Hls.prototype || Hls.prototype.__viaLoad) return;
      origLoad = Hls.prototype.loadSource;
      origAttach = Hls.prototype.attachMedia;
      if (typeof origLoad !== "function") return;
      Hls.prototype.__viaLoad = true;
      Hls.prototype.loadSource = function (url) {
        var main = videoEl();
        this.__viaUrl = url;
        if (!this.media || !main || this.media === main) {
          rememberMedia(url);
          window.__viaHls = this;
        }
        return origLoad.apply(this, arguments);
      };
      if (typeof origAttach === "function") {
        Hls.prototype.attachMedia = function (media) {
          var result = origAttach.apply(this, arguments);
          if (media && media === videoEl()) {
            window.__viaHls = this;
            if (this.__viaUrl) rememberMedia(this.__viaUrl);
          }
          return result;
        };
      }
    }

    function hlsOf() {
      var video = videoEl();
      var player = window.player;
      hookHls();
      if (window.__viaHls && video && window.__viaHls.media === video) return window.__viaHls;
      if (video && video.hls) return video.hls;
      if (player && player.hls) return player.hls;
      if (player && player.media && player.media.hls) return player.media.hls;
      if (window.hls && window.hls.url) return window.hls;
      return null;
    }

    function levelUrl(hls) {
      var level;
      var urls;
      var index;
      if (!hls) return "";
      index = hls.currentLevel;
      if (!(index >= 0)) index = hls.loadLevel;
      try {
        if (index >= 0 && hls.levels && hls.levels[index]) {
          level = hls.levels[index];
          urls = level.url;
          if (typeof urls === "string") return urls;
          if (urls && urls.length) return urls[0];
        }
      } catch (e) {}
      return hls.url || hls.__viaUrl || "";
    }

    function sniffedMedia() {
      var list;
      var i;
      var name;
      var mp4 = "";
      if (!window.performance || !performance.getEntriesByType) return "";
      try {
        list = performance.getEntriesByType("resource") || [];
      } catch (e) {
        return "";
      }
      for (i = list.length - 1; i >= 0; i--) {
        name = list[i].name || "";
        if (/\.m3u8(\?|#|$)/i.test(name)) return name;
        if (!mp4 && /\.mp4(\?|#|$)/i.test(name)) mp4 = name;
      }
      return mp4;
    }

    function readMedia() {
      var hls = hlsOf();
      var video = videoEl();
      var player = window.player;
      var url = levelUrl(hls);
      var sources;
      var i;
      var src;
      if (!url && video) {
        sources = video.querySelectorAll("source");
        for (i = 0; i < sources.length; i++) {
          src = sources[i].src || sources[i].getAttribute("src") || "";
          if (src && src.indexOf("blob:") !== 0) {
            url = src;
            break;
          }
        }
      }
      if (!url && player && player.source && player.source.sources) {
        sources = player.source.sources;
        for (i = 0; i < sources.length; i++) {
          src = sources[i] && sources[i].src;
          if (src && String(src).indexOf("blob:") !== 0) {
            url = src;
            break;
          }
        }
      }
      if (!url && video && video.currentSrc && video.currentSrc.indexOf("blob:") !== 0) url = video.currentSrc;
      if (!url) url = sniffedMedia();
      if (url) rememberMedia(url);
      return window.__viaMediaUrl || url || "";
    }

    function copyUrlFallback(text) {
      var ta = document.createElement("textarea");
      var ok = false;
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }

    function copyUrl(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(function () {
          if (!copyUrlFallback(text)) throw new Error("copy");
        });
      }
      return copyUrlFallback(text) ? Promise.resolve() : Promise.reject(new Error("copy"));
    }

    function downloadToast(message, failed) {
      var tip = document.getElementById("via-missav-dl-toast");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "via-missav-dl-toast";
        tip.setAttribute("data-via-missav-keep", "1");
        tip.style.cssText =
          "position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:2147483647;" +
          "padding:8px 14px;border-radius:999px;background:rgba(20,20,20,.92);color:#fff;" +
          "font-size:14px;font-weight:400;line-height:1.3;pointer-events:none;";
        (document.body || document.documentElement).appendChild(tip);
      }
      tip.textContent = message;
      tip.style.border = failed ? "1px solid #bf616a" : "1px solid transparent";
      tip.style.display = "block";
      if (downloadToast.timer) window.clearTimeout(downloadToast.timer);
      downloadToast.timer = window.setTimeout(function () {
        tip.style.display = "none";
      }, 1600);
    }

    function armDownload(btn) {
      var tip;
      var svgs;
      var i;
      var svg;
      if (!btn) return;
      btn.setAttribute("data-via-download", "1");
      btn.setAttribute("aria-label", "下载");
      tip = btn.querySelector(".plyr__tooltip");
      if (tip) tip.textContent = "下载";
      svgs = btn.querySelectorAll("svg");
      for (i = 0; i < svgs.length; i++) {
        svg = svgs[i];
        if (svg.closest && svg.closest(".via-dl")) continue;
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      }
      if (!btn.querySelector(".via-dl")) {
        btn.insertAdjacentHTML(
          "afterbegin",
          '<span class="via-dl"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
            '<path fill="currentColor" d="M12 3v9.2l3.3-3.3 1.4 1.4L12 15.9 7.3 10.3l1.4-1.4L12 12.2V3zM5 18h14v2H5z"/>' +
            "</svg></span>"
        );
      }
    }

    function armDownloads() {
      var nodes = document.querySelectorAll('button[data-plyr="settings"]');
      var i;
      hookHls();
      readMedia();
      for (i = 0; i < nodes.length; i++) armDownload(nodes[i]);
    }

    function onDownloadPress(event) {
      var btn = event.target && event.target.closest && event.target.closest('button[data-plyr="settings"]');
      var menu;
      var panel;
      var url;
      if (!btn) return;
      /* 采集清晰度菜单时放行，让播放器自己把菜单建出来 */
      if (qSuppress) return;
      armDownload(btn);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      menu = btn.closest && btn.closest(".plyr__menu");
      panel = menu && menu.querySelector(".plyr__menu__container");
      if (panel) panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      if (event.type === "touchend") {
        lastBtnTouch = Date.now();
      } else if (Date.now() - lastBtnTouch < 700) {
        return;
      }
      url = readMedia();
      if (!url) {
        downloadToast("没有找到下载链接", true);
        return;
      }
      copyUrl(url).then(
        function () {
          downloadToast("已复制下载链接", false);
        },
        function () {
          downloadToast("复制失败", true);
        }
      );
    }

    function mediaTime() {
      var player = window.player;
      var video = videoEl();
      if (player && typeof player.currentTime === "number" && isFinite(player.currentTime)) return player.currentTime;
      return video ? video.currentTime || 0 : 0;
    }

    function mediaDuration() {
      var player = window.player;
      var video = videoEl();
      var d = player && player.duration;
      if (d && isFinite(d) && d > 0) return d;
      d = video && video.duration;
      return d && isFinite(d) ? d : 0;
    }

    /* 只写一次：同时写 player 和 video 会触发两次 seek，是音画不同步的来源之一 */
    function seekTo(time) {
      var player = window.player;
      var video = videoEl();
      time = clampTime(time, mediaDuration());
      if (video) {
        try {
          video.currentTime = time;
          return;
        } catch (e) {}
      }
      try {
        if (player && typeof player.currentTime === "number") player.currentTime = time;
      } catch (e2) {}
    }

    /* 快进快退合并：连点只在停手后真正跳一次，避免连续 seek 让音轨和画面错位 */
    function commitSeek() {
      var video = videoEl();
      var wasPlaying = !isPaused();
      var target;
      seekCommitTimer = 0;
      target = clampTime(seekBase + seekAcc, mediaDuration());
      seekAcc = 0;
      seekTo(target);
      if (wasPlaying && video) {
        var recover = function () {
          video.removeEventListener("seeked", recover);
          if (video.paused && !slide) {
            var maybe = video.play();
            if (maybe && maybe.catch) maybe.catch(function () {});
          }
        };
        video.addEventListener("seeked", recover);
        window.setTimeout(function () {
          video.removeEventListener("seeked", recover);
        }, 1500);
      }
    }

    function flushSeek() {
      if (!seekCommitTimer) return;
      window.clearTimeout(seekCommitTimer);
      commitSeek();
    }

    function queueSeek(delta) {
      if (!seekCommitTimer) {
        seekBase = mediaTime();
        seekAcc = 0;
      } else {
        window.clearTimeout(seekCommitTimer);
      }
      seekAcc += delta;
      seekCommitTimer = window.setTimeout(commitSeek, 220);
    }

    /* 拖动进度时限频 seek，松手再补一次精确位置 */
    function scrubSeek(time, force) {
      var wait;
      scrubSeekTime = time;
      wait = force ? 0 : Math.max(0, 320 - (Date.now() - scrubSeekAt));
      if (wait <= 0) {
        flushScrubSeek();
        return;
      }
      if (!scrubSeekTimer) scrubSeekTimer = window.setTimeout(flushScrubSeek, wait);
    }

    function flushScrubSeek() {
      var time = scrubSeekTime;
      if (scrubSeekTimer) {
        window.clearTimeout(scrubSeekTimer);
        scrubSeekTimer = 0;
      }
      if (time === null) return;
      scrubSeekTime = null;
      scrubSeekAt = Date.now();
      seekTo(time);
    }

    function resumeAfterSeek() {
      var video = videoEl();
      var done = false;
      function go() {
        if (done) return;
        done = true;
        if (video) video.removeEventListener("seeked", go);
        playNow();
      }
      if (!video || !video.seeking) {
        go();
        return;
      }
      video.addEventListener("seeked", go);
      window.setTimeout(go, 800);
    }

    function formatClock(time) {
      var total = Math.max(0, Math.floor(time || 0));
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var sec = total % 60;
      function pad(n) {
        return (n < 10 ? "0" : "") + n;
      }
      if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
      return pad(m) + ":" + pad(sec);
    }

    function clearVeil() {
      var veil = document.getElementById("via-missav-veil");
      if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
    }

    /*
     * 亮度和音量只作用在当前视频上，不依赖任何外部服务：
     * 亮度用视频的 filter: brightness()，最大 100%，也就是当前系统亮度；
     * 音量用 video.volume，最大 100%，也就是当前系统音量。
     */
    function readBright() {
      var raw;
      var n;
      try {
        raw = window.localStorage.getItem(BRIGHT_KEY);
      } catch (e) {
        raw = null;
      }
      n = parseFloat(raw);
      if (isFinite(n)) brightLevel = Math.max(BRIGHT_MIN, Math.min(1, n));
    }

    function applyBright() {
      var video = videoEl();
      if (!video || !video.style) return;
      if (brightLevel >= 0.995) {
        if (video.style.filter) video.style.removeProperty("filter");
        return;
      }
      video.style.setProperty("filter", "brightness(" + brightLevel.toFixed(3) + ")", "important");
    }

    function setBright(level) {
      brightLevel = Math.max(BRIGHT_MIN, Math.min(1, level));
      applyBright();
    }

    function saveBright() {
      try {
        window.localStorage.setItem(BRIGHT_KEY, String(brightLevel));
      } catch (e) {}
    }

    function brightPercent() {
      return Math.round(((brightLevel - BRIGHT_MIN) / (1 - BRIGHT_MIN)) * 100);
    }

    function currentVolume() {
      var video = videoEl();
      if (!video) return 0;
      return video.muted ? 0 : Math.max(0, Math.min(1, video.volume));
    }

    function setVolume(level) {
      var video = videoEl();
      level = Math.max(0, Math.min(1, level));
      if (!video) return;
      try {
        video.volume = level;
      } catch (e) {}
      video.muted = level <= 0;
    }

    function volPercent() {
      return Math.round(currentVolume() * 100);
    }

    function showLevel(side, label, pct) {
      var wrap = ensureOverlay();
      var node;
      var other;
      if (!wrap) return;
      pinHud(wrap);
      node = wrap.querySelector(".via-level." + side);
      other = wrap.querySelector(".via-level." + (side === "left" ? "right" : "left"));
      if (other) {
        other.classList.remove("on");
        other.textContent = "";
      }
      if (!node) return;
      node.style.fontSize = titlePx() + "px";
      node.textContent = "";
      node.appendChild(document.createTextNode(label));
      var num = document.createElement("b");
      num.textContent = pct + "%";
      node.appendChild(num);
      node.classList.add("on");
    }

    function hideLevels() {
      var wrap = document.getElementById("via-missav-hud");
      var nodes;
      var i;
      if (!wrap) return;
      nodes = wrap.querySelectorAll(".via-level");
      for (i = 0; i < nodes.length; i++) nodes[i].classList.remove("on");
      if (!wrap.querySelector(".via-side.on, .via-flash.on, .via-scrub.on")) hideHud();
    }

    function hideScrub() {
      var wrap = document.getElementById("via-missav-hud");
      var scrub = wrap && wrap.querySelector(".via-scrub");
      if (scrub) scrub.classList.remove("on");
      if (wrap && !wrap.querySelector(".via-side.on, .via-flash.on, .via-level.on")) hideHud();
    }

    function vttSeconds(text) {
      var parts = String(text || "").trim().split(":");
      var h = 0;
      var m = 0;
      var s = 0;
      if (parts.length >= 3) {
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
        s = parseFloat(parts[2]) || 0;
      } else if (parts.length === 2) {
        m = parseInt(parts[0], 10) || 0;
        s = parseFloat(parts[1]) || 0;
      } else {
        s = parseFloat(parts[0]) || 0;
      }
      return h * 3600 + m * 60 + s;
    }

    function resolveUrl(base, rel) {
      try {
        return new URL(rel, base).href;
      } catch (e) {
        return rel;
      }
    }

    function parseVtt(text, vttUrl) {
      var lines = String(text || "").replace(/\r/g, "").split("\n");
      var cues = [];
      var i = 0;
      var line;
      var times;
      var body;
      var xywh;
      var start;
      var end;
      var raw;
      while (i < lines.length) {
        line = lines[i].trim();
        if (line.indexOf("-->") === -1) {
          i += 1;
          continue;
        }
        times = line.split("-->");
        start = vttSeconds(times[0]);
        end = vttSeconds((times[1] || "").split(/\s/)[0]);
        i += 1;
        body = "";
        while (i < lines.length && lines[i].trim()) {
          body += (body ? "\n" : "") + lines[i].trim();
          i += 1;
        }
        raw = body.split(/\s/)[0] || "";
        xywh = raw.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/i);
        cues.push({
          start: start,
          end: end > start ? end : start,
          url: resolveUrl(vttUrl, raw.split("#")[0]),
          xywh: xywh ? { x: +xywh[1], y: +xywh[2], w: +xywh[3], h: +xywh[4] } : null
        });
      }
      return cues;
    }

    function rememberVtt(url) {
      if (!url || !/\.vtt(\?|#|$)/i.test(String(url))) return;
      window.__viaVtt = String(url);
    }

    function vttSources() {
      var list = [];
      var seen = {};
      var player = window.player;
      var src;
      var media;
      var match;
      var base;
      var parts;
      var slug;
      var i;
      function add(url) {
        if (!url || seen[url]) return;
        seen[url] = 1;
        list.push(url);
      }
      if (window.__viaVtt) add(window.__viaVtt);
      src = player && player.config && player.config.previewThumbnails && player.config.previewThumbnails.src;
      if (typeof src === "string") add(src);
      else if (src && src.length) {
        for (i = 0; i < src.length; i++) if (typeof src[i] === "string") add(src[i]);
      }
      media = window.__viaMediaUrl || "";
      try {
        if (typeof readMedia === "function") media = readMedia() || media;
      } catch (e) {}
      match = String(media).match(/^(https?:\/\/[^/?#]+\/[0-9a-f-]{36})/i);
      if (match) {
        base = match[1];
        add(base + "/thumbnails.vtt");
        add(base + "/thumbnail.vtt");
        add(base + "/preview.vtt");
        add(base + "/storyboard.vtt");
        add(base + "/seek/thumbnails.vtt");
        add(base + "/640x360/thumbnails.vtt");
      }
      parts = (location.pathname || "").split("/");
      slug = parts[parts.length - 1] || "";
      if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(slug)) {
        add("https://fourhoi.com/" + slug + "/preview.vtt");
        add("https://fourhoi.com/" + slug + "/thumbnails.vtt");
        add("https://fourhoi.com/" + slug + "/seek/thumbnails.vtt");
      }
      return list;
    }

    function loadThumbCues() {
      var sources;
      var key;
      if (thumbCues || thumbLoading) return;
      sources = vttSources();
      if (!sources.length) return;
      key = sources.join("|");
      if (key === thumbKey) return;
      thumbKey = key;
      thumbLoading = true;
      tryNext(0);
      function tryNext(index) {
        var xhr;
        if (thumbCues || index >= sources.length) {
          thumbLoading = false;
          return;
        }
        xhr = new XMLHttpRequest();
        xhr.open("GET", sources[index], true);
        xhr.onload = function () {
          var text = xhr.responseText || "";
          if (xhr.status >= 200 && xhr.status < 300 && /WEBVTT/i.test(text) && text.indexOf("-->") !== -1) {
            thumbCues = parseVtt(text, sources[index]);
            thumbLoading = false;
            window.__viaVtt = sources[index];
            return;
          }
          tryNext(index + 1);
        };
        xhr.onerror = function () {
          tryNext(index + 1);
        };
        try {
          xhr.send();
        } catch (e) {
          tryNext(index + 1);
        }
      }
    }

    function adoptPlyrThumbs() {
      var pt = window.player && window.player.previewThumbnails;
      var raw;
      var out = [];
      var i;
      var item;
      var text;
      var xywh;
      var url;
      if (!pt) return null;
      raw = pt.thumbnails;
      if (!raw || !raw.length) {
        try {
          if (!pt.loaded && typeof pt.load === "function") pt.load();
        } catch (e) {}
        return null;
      }
      for (i = 0; i < raw.length; i++) {
        item = raw[i] || {};
        text = item.text || (item.frames && item.frames[0] && item.frames[0].text) || item.url || "";
        if (!text) continue;
        xywh = String(text).match(/#xywh=(\d+),(\d+),(\d+),(\d+)/i);
        url = String(text).split("#")[0].trim();
        out.push({
          start: item.start != null ? item.start : item.startTime || 0,
          end: item.end != null ? item.end : item.endTime || 0,
          url: url,
          xywh: xywh ? { x: +xywh[1], y: +xywh[2], w: +xywh[3], h: +xywh[4] } : null
        });
      }
      return out.length ? out : null;
    }

    function cueAt(time) {
      var i;
      var best = null;
      if (!thumbCues || !thumbCues.length) thumbCues = adoptPlyrThumbs();
      if (!thumbCues || !thumbCues.length) return null;
      for (i = 0; i < thumbCues.length; i++) {
        if (thumbCues[i].start <= time) best = thumbCues[i];
        else break;
      }
      return best || thumbCues[0];
    }

    function paintThumb(pip, cue, viewW) {
      function place(sheet) {
        var scale;
        if (!cue.xywh) {
          pip.style.width = viewW + "px";
          pip.style.height = Math.round((viewW * 9) / 16) + "px";
          pip.style.backgroundImage = 'url("' + cue.url + '")';
          pip.style.backgroundSize = "cover";
          pip.style.backgroundPosition = "center";
          return;
        }
        scale = viewW / (cue.xywh.w || 1);
        pip.style.width = Math.round(viewW) + "px";
        pip.style.height = Math.round(cue.xywh.h * scale) + "px";
        pip.style.backgroundImage = 'url("' + cue.url + '")';
        pip.style.backgroundRepeat = "no-repeat";
        if (sheet && sheet.w) {
          pip.style.backgroundSize = Math.round(sheet.w * scale) + "px " + Math.round(sheet.h * scale) + "px";
        }
        pip.style.backgroundPosition = Math.round(-cue.xywh.x * scale) + "px " + Math.round(-cue.xywh.y * scale) + "px";
      }
      if (!cue || !cue.url) {
        pip.style.backgroundImage = "none";
        pip.style.width = viewW + "px";
        pip.style.height = Math.round((viewW * 9) / 16) + "px";
        return;
      }
      if (!cue.xywh || thumbSheets[cue.url]) {
        place(thumbSheets[cue.url]);
        return;
      }
      place(null);
      var img = new Image();
      img.onload = function () {
        thumbSheets[cue.url] = { w: img.naturalWidth, h: img.naturalHeight };
        if (slide && slide.mode === "scrub") place(thumbSheets[cue.url]);
      };
      img.src = cue.url;
    }

    function showScrub(time) {
      var wrap = ensureOverlay();
      var scrub;
      var label;
      var rect;
      var scale = 1;
      var area;
      if (!wrap) return;
      pinHud(wrap);
      scrub = wrap.querySelector(".via-scrub");
      label = wrap.querySelector(".via-scrub-time");
      if (!scrub || !label) return;
      rect = boxRect();
      if (fsNode() && inlineArea) {
        area = (rect.width || 1) * (rect.height || 1);
        scale = Math.sqrt(area / inlineArea);
        if (scale < 1) scale = 1;
        if (scale > 8) scale = 8;
      }
      label.style.fontSize = titlePx() * scale + "px";
      label.textContent = formatClock(time) + scrubDeltaText(time);
      scrub.classList.add("on");
    }

    function scrubDeltaText(time) {
      var delta;
      if (!slide || typeof slide.baseTime !== "number") return "";
      delta = Math.round(time - slide.baseTime);
      if (!delta) return "";
      return "  (" + (delta > 0 ? "+" : "-") + Math.abs(delta) + "s)";
    }

    function pointOf(event) {
      var t = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
      if (t) return { x: t.clientX, y: t.clientY };
      return { x: event.clientX, y: event.clientY };
    }

    function clearLong() {
      if (longTimer) {
        window.clearTimeout(longTimer);
        longTimer = 0;
      }
    }

    function enterScrub() {
      longTimer = 0;
      if (!slide || slide.mode) return;
      flushSeek();
      slide.mode = "scrub";
      slide.wasPaused = isPaused();
      slide.baseTime = mediaTime();
      slide.time = slide.baseTime;
      if (!slide.wasPaused) pauseNow();
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
      }
      skipTap = Date.now() + 1200;
      showScrub(slide.baseTime);
    }

    function updateSlide(dy) {
      var rect = boxRect();
      var ratio = -dy / Math.max(1, (rect.height || 1) * 0.85);
      if (!slide) return;
      if (slide.mode === "bright") {
        setBright(slide.bright0 + ratio * (1 - BRIGHT_MIN));
        showLevel("left", "亮度", brightPercent());
        return;
      }
      if (slide.mode === "vol") {
        setVolume(slide.vol0 + ratio);
        showLevel("right", "音量", volPercent());
      }
    }

    /* 整个画面宽度对应的可拖动时长：最多 5 分钟，短视频则是整段 */
    function updateScrub(dx) {
      var rect = boxRect();
      var dur = mediaDuration();
      var span = dur > 0 ? Math.min(dur, 300) : 300;
      var time;
      if (!slide) return;
      time = clampTime(slide.baseTime + (dx / Math.max(1, rect.width || 1)) * span, dur);
      slide.time = time;
      scrubSeek(time, false);
      showScrub(time);
    }

    function onGestureStart(event) {
      var p;
      if (!isWatchPage()) return;
      if (!event.touches || event.touches.length !== 1) return;
      if (chrome(event.target) || !inPlayer(event.target)) return;
      p = pointOf(event);
      slide = {
        x: p.x,
        y: p.y,
        mode: "",
        moved: false,
        bright0: brightLevel,
        vol0: currentVolume(),
        baseTime: mediaTime(),
        time: mediaTime()
      };
      clearLong();
      longTimer = window.setTimeout(enterScrub, 500);
      if (event.cancelable) event.preventDefault();
    }

    function onGestureMove(event) {
      var p;
      var dx;
      var dy;
      var rect;
      if (!slide || !event.touches || event.touches.length !== 1) return;
      p = pointOf(event);
      dx = p.x - slide.x;
      dy = p.y - slide.y;
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) slide.moved = true;
      if (slide.mode === "scrub") {
        if (event.cancelable) event.preventDefault();
        updateScrub(dx);
        return;
      }
      if (slide.mode === "bright" || slide.mode === "vol") {
        if (event.cancelable) event.preventDefault();
        updateSlide(dy);
        return;
      }
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      clearLong();
      if (Math.abs(dy) <= Math.abs(dx)) {
        /* 横向拖动：不用长按，直接进入进度调整 */
        enterScrub();
        if (event.cancelable) event.preventDefault();
        updateScrub(dx);
        return;
      }
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
      }
      skipTap = Date.now() + 900;
      rect = boxRect();
      slide.mode = asCssPoint(slide.x, slide.y, rect).x - rect.left < (rect.width || 1) / 2 ? "bright" : "vol";
      if (event.cancelable) event.preventDefault();
      updateSlide(dy);
    }

    function onGestureEnd(event) {
      var mode = slide && slide.mode;
      var moved = slide && slide.moved;
      var resume = slide && slide.wasPaused === false;
      clearLong();
      if (mode === "scrub" || mode === "bright" || mode === "vol" || moved) {
        skipTap = Date.now() + 700;
        if (pending) {
          window.clearTimeout(pending);
          pending = 0;
        }
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
      }
      if (mode === "bright") saveBright();
      if (mode === "scrub") {
        hideScrub();
        if (slide && typeof slide.time === "number") scrubSeek(slide.time, true);
        if (resume) resumeAfterSeek();
      } else if (mode === "bright" || mode === "vol") {
        window.setTimeout(hideLevels, 450);
      }
      slide = null;
    }

    function hookNet() {
      var origFetch;
      var origOpen;
      if (window.__viaMissavNetHook) return;
      window.__viaMissavNetHook = 1;
      if (typeof window.fetch === "function") {
        origFetch = window.fetch;
        window.fetch = function (input) {
          try {
            rememberVtt(typeof input === "string" ? input : (input && input.url) || "");
          } catch (e) {}
          return origFetch.apply(this, arguments);
        };
      }
      if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
        origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
          try {
            rememberVtt(url);
          } catch (e2) {}
          return origOpen.apply(this, arguments);
        };
      }
    }

    function scanResources() {
      var entries;
      var i;
      if (!window.performance || !performance.getEntriesByType) return;
      try {
        entries = performance.getEntriesByType("resource");
      } catch (e) {
        return;
      }
      for (i = entries.length - 1; i >= 0; i--) {
        if (/\.vtt(\?|#|$)/i.test(entries[i].name || "")) {
          rememberVtt(entries[i].name);
          return;
        }
      }
    }

    clearVeil();
    readBright();
    applyBright();
    injectStyle();
    removeLegacyLayer();
    document.addEventListener("touchstart", onGestureStart, { capture: true, passive: false });
    document.addEventListener("touchmove", onGestureMove, { capture: true, passive: false });
    document.addEventListener("touchend", onGestureEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", onGestureEnd, { capture: true, passive: false });
    document.addEventListener(
      "contextmenu",
      function (event) {
        if (!inPlayer(event.target) || chrome(event.target)) return;
        event.preventDefault();
      },
      true
    );
    document.addEventListener(
      "touchstart",
      function (event) {
        rememberPoint(event);
      },
      { capture: true, passive: true }
    );
    document.addEventListener(
      "touchend",
      function (event) {
        lastTouch = Date.now();
        rememberPoint(event);
        onTap(event);
      },
      { capture: true, passive: false }
    );
    document.addEventListener(
      "click",
      function (event) {
        if (Date.now() - lastTouch < 700) return;
        onTap(event);
      },
      true
    );
    document.addEventListener("touchend", onDownloadPress, true);
    document.addEventListener("click", onDownloadPress, true);
    document.addEventListener("dblclick", onDblClick, true);
    disablePlyr();
    hookVideo();
    armDownloads();
    if (isWatchPage()) {
      ensureOverlay();
      setUi(false);
    }
    window.setInterval(function () {
      removeLegacyLayer();
      injectStyle();
      if (!isWatchPage()) return;
      disablePlyr();
      hookVideo();
      watchPlyr();
      ensureOverlay();
      if (!fsNode()) {
        var inlineRect = boxRect();
        if (inlineRect.width * inlineRect.height >= 8000) {
          inlineArea = inlineRect.width * inlineRect.height;
        }
      }
      paintControls(uiShown);
      armDownloads();
      ensureQualityButton();
      if (qOpen) {
        renderQuality();
        pinQuality(document.getElementById("via-missav-quality"));
        setUi(true);
      }
      clearVeil();
      applyBright();
      var touchHost = videoHost();
      if (touchHost && touchHost.style) touchHost.style.touchAction = "none";
    }, 800);

    statHookNet();
    if (statTimer) window.clearInterval(statTimer);
    statTimer = window.setInterval(paintStats, 500);
    paintStats();
  }

  function injectPageGestureHook() {
    var root = document.documentElement;
    if (!root) return;
    if (root.getAttribute("data-via-missav-gesture-live") === "22") return;
    try {
      if (root.getAttribute("data-via-missav-gesture") !== "22") {
        root.setAttribute("data-via-missav-gesture", "22");
        injectInlineScript("(" + pageGestureHook.toString() + ")();");
      }
    } catch (e) {}
    try {
      if (root.getAttribute("data-via-missav-gesture-live") === "22") return;
      pageGestureHook();
    } catch (e2) {}
  }

  function hasPopHandler(node) {
    var el = node;
    var names;
    var i;
    var val;
    while (el && el !== document.documentElement) {
      if (el.getAttributeNames) {
        names = el.getAttributeNames();
        for (i = 0; i < names.length; i++) {
          val = el.getAttribute(names[i]) || "";
          if (/\bpop\s*\(/.test(val)) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function disablePopHandlers() {
    var nodes = document.querySelectorAll("*");
    var i;
    var n;
    var el;
    var names;
    var val;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (!el.getAttributeNames) continue;
      names = el.getAttributeNames();
      for (n = 0; n < names.length; n++) {
        val = el.getAttribute(names[n]) || "";
        if (/\bpop\s*\(/.test(val) && /click|keyup|keydown|touch/i.test(names[n])) {
          el.removeAttribute(names[n]);
        }
      }
    }
  }

  function installClickGuard() {
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target;
        var video;
        if (!inPlayer(target)) return;
        playerClickUntil = Date.now() + 2000;
        if (isPlayerChrome(target)) return;
        var link = target.closest ? target.closest("a") : null;
        if (link && shouldBlockNavNow(link.href || link.getAttribute("href"))) {
          event.preventDefault();
          event.stopImmediatePropagation();
          schedulePlay();
          return;
        }
        video = document.querySelector("video.player") || document.querySelector("#player video") || document.querySelector("video:not(.preview)");
        if (hasPopHandler(target) && (!video || video.paused)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          schedulePlay();
        }
      },
      true
    );
  }

  function injectAdCss() {
    var parent = document.head || document.documentElement;
    var style = document.getElementById(AD_STYLE_ID);
    if (!parent) return;
    if (!style) {
      style = document.createElement("style");
      style.id = AD_STYLE_ID;
      parent.appendChild(style);
    }
    style.textContent =
      '.relative>div[x-init*="campaignId=under_player"]:not(:has(video)):not(:has(#player)):not(:has(.plyr)),' +
      'div[x-init*="campaignId=under_player"]:not(:has(video)):not(:has(#player)):not(:has(.plyr)),' +
      '[class*="under_player"],' +
      'div[x-init*="#genki-counter"],' +
      "div.ts-outstream-video," +
      '[class*="ts-outstream"],' +
      '[data-ts-spot],' +
      '#b-a-b,' +
      'div[class*="fixed"][class*="bottom-"][class*="right-"],' +
      'div[class*="fixed"][class*="right-"][class*="bottom-"],' +
      'div[style*="width: 300px; height: 250px"],' +
      'div[style*="width: 300px; height: 100px"],' +
      'a[href*="//bit.ly/"],' +
      'a[href*="go.myavlive.com"],' +
      'img[alt="MissAV takeover Fanza"],' +
      "ul.mb-4.list-none.text-nord14," +
      'iframe[src*="tsyndicate"],' +
      'iframe[src*="exoclick"],' +
      'iframe[src*="juicyads"],' +
      'iframe[src*="myavlive"],' +
      'iframe[src*="doubleclick"],' +
      'iframe[src*="googlesyndication"],' +
      'body > iframe[style*="position:fixed"],' +
      'body > iframe[style*="position: fixed"],' +
      'iframe[src*="smartpop"],' +
      'iframe[src*="stripcash"],' +
      'iframe[src*="inpage"],' +
      'iframe[src*="liveef"],' +
      'iframe[src*="live-ef"],' +
      '[id*="tsyndicate"],' +
      '[id*="liveef"],' +
      '[class*="liveef"],' +
      '[class*="LIVEEF"],' +
      '[class*="ts-inpage"],' +
      '[class*="inpage-push"],' +
      '[class*="ts-outstream"],' +
      '#via-missav-layer,' +
      'body > div:has(iframe[src*="tsyndicate"]):not(:has(video)):not(:has(#player)):not(:has(.plyr)),' +
      'body > div:has(iframe[src*="exoclick"]):not(:has(video)):not(:has(#player)):not(:has(.plyr)),' +
      'body > div:has(iframe[src*="juicyads"]):not(:has(video)):not(:has(#player)):not(:has(.plyr)),' +
      '[data-via-missav-ad="1"],' +
      '[data-via-missav-looprow="1"]{display:none!important;pointer-events:none!important;height:0!important;min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}';
  }

  function hideLoopStrip() {
    var nodes = document.querySelectorAll("button, a, span, div, label, p");
    var i;
    var el;
    var row;
    var parent;
    var rect;
    var hops;
    if (!isWatchPath()) return;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (!el || isOurUi(el)) continue;
      if (el.closest && el.closest(".plyr, #player, .plyr__controls, #via-missav-seekbar")) continue;
      if (!/循环播放/.test(compactText(el)) || compactText(el).length > 8) continue;
      row = el;
      hops = 0;
      while (row.parentElement && row.parentElement !== document.body && hops < 6) {
        parent = row.parentElement;
        if (parent.querySelector("h1, video, .plyr, #player")) break;
        rect = parent.getBoundingClientRect();
        if (rect.height > 160) break;
        row = parent;
        hops += 1;
      }
      if (!row || row === document.body) continue;
      if (row.querySelector && row.querySelector("h1, video, .plyr, #player")) continue;
      row.setAttribute("data-via-missav-looprow", "1");
      parent = row.parentElement;
      if (
        parent &&
        parent !== document.body &&
        !parent.querySelector("h1") &&
        parent.querySelector(".plyr, #player, video")
      ) {
        parent.style.setProperty("padding-bottom", "0", "important");
        parent.style.setProperty("margin-bottom", "0", "important");
        parent.style.setProperty("gap", "0", "important");
      }
    }
  }

  function isWatchPath() {
    return /\/[a-z]{2,14}-\d{2,6}/i.test(location.pathname || "");
  }

  function looksLikeVideoCard(el) {
    var text;
    if (!el || !el.querySelector) return false;
    if (el.id === "player" || (el.closest && el.closest("#player, .plyr"))) return false;
    if (el.querySelector("#player, .plyr__controls, video.player")) return false;
    if (el.querySelector("img") && el.querySelector("a[href]")) return true;
    text = compactText(el);
    if (/[A-Z0-9]{2,12}-\d{2,6}/i.test(text) && el.querySelector("img, a")) return true;
    if (el.querySelectorAll("a[href]").length >= 4 && el.querySelector("img")) return true;
    return false;
  }

  function restoreMistakenContent() {
    var nodes = document.querySelectorAll("[data-via-missav-ad='1']");
    var i;
    var el;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (holdsMainPlayer(el) || looksLikeContent(el)) {
        clearAdHide(el);
        continue;
      }
      if (looksLikeAdMarkup(el)) continue;
      if (!looksLikeVideoCard(el)) continue;
        clearAdHide(el);
    }
  }

  function isMainPlayer(el) {
    if (!el) return false;
    if (el.id === "player" || el.id === "video") return true;
    if (el.classList && (el.classList.contains("plyr") || el.classList.contains("player"))) return true;
    if (el.closest) return Boolean(el.closest("#player, .plyr, video.player, [data-demo-player]"));
    return false;
  }

  function holdsMainPlayer(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.id === "player" || (el.classList && el.classList.contains("plyr"))) return true;
    if (el.tagName === "VIDEO" && el.classList && el.classList.contains("player")) return true;
    if (el.closest && el.closest("#player, .plyr, [data-demo-player]")) return true;
    if (!el.querySelector) return false;
    return Boolean(el.querySelector("#player, .plyr, video.player"));
  }

  function isProtected(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    if (
      el.id === BTN_ID ||
      el.id === "player" ||
      el.id === "video" ||
      el.id === "via-missav-layer" ||
      el.id === "via-missav-hud" ||
      el.id === "via-missav-stats" ||
      el.id === "via-missav-quality-btn" ||
      el.id === "via-missav-quality" ||
      el.id === "via-missav-overlay" ||
      el.id === "via-missav-play" ||
      el.id === "via-missav-seekbar"
    ) {
      return true;
    }
    if (el.getAttribute(BTN_ATTR) === "1") return true;
    if (el.getAttribute("data-demo-player") === "1") return true;
    if (el.getAttribute("data-via-missav-keep") === "1") return true;
    if (el.getAttribute(CTRL_ATTR) === "1") return true;
    if (el.tagName === "H1" || el.tagName === "VIDEO") return true;
    if (isMainPlayer(el) || holdsMainPlayer(el)) return true;
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    return /\b(toolbar|missav-shell|tags|info-table|player|video-title)\b/.test(cls);
  }

  function clearAdHide(el) {
    if (!el || el.getAttribute("data-via-missav-ad") !== "1") return;
    el.removeAttribute("data-via-missav-ad");
    el.hidden = false;
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("pointer-events");
    el.style.removeProperty("opacity");
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
    el.style.removeProperty("margin");
    el.style.removeProperty("padding");
  }

  function revealPlayer() {
    var seeds = document.querySelectorAll("#player, .plyr, video.player, video");
    var i;
    var el;
    var hops;
    for (i = 0; i < seeds.length; i++) {
      el = seeds[i];
      hops = 0;
      while (el && el !== document.body && hops < 8) {
        clearAdHide(el);
        el = el.parentElement;
        hops += 1;
      }
    }
  }

  function hideNode(el) {
    if (!el || isProtected(el) || isOurUi(el) || holdsMainPlayer(el)) return;
    el.setAttribute("data-via-missav-ad", "1");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("opacity", "0", "important");
    el.hidden = true;
  }

  function looksLikeContent(el) {
    if (!el) return false;
    if (isProtected(el)) return true;
    if (el.querySelector && el.querySelector("h1, h2, table, video, #" + BTN_ID)) {
      return true;
    }
    return /番号|女优|女優|發行|发行|演员|類型|类型/.test(compactText(el));
  }

  function looksLikeAd(el) {
    if (!el || looksLikeContent(el)) return false;
    var html = el.outerHTML || "";
    if (
      /campaignId=under_player|myavlive|tsyndicate|adsbygoogle|rel=["']sponsored|go\.myavlive|300px;\s*height:\s*250px/i.test(
        html
      )
    ) {
      return true;
    }
    if (el.querySelector && el.querySelector("iframe, ins.adsbygoogle, [rel='sponsored']")) {
      return true;
    }
    var h = el.offsetHeight || 0;
    if (h >= 90 && h <= 280 && !compactText(el) && el.querySelector("img, iframe, a")) {
      return true;
    }
    return false;
  }

  function findShareButton() {
    var nodes = document.querySelectorAll('button, a, [role="button"]');
    var i;
    var el;
    var firstIconShare = null;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (looksLikeShare(el)) {
        if (compactText(el).length) return el;
        if (!firstIconShare) firstIconShare = el;
      }
    }
    return firstIconShare;
  }

  function looksLikeShare(el) {
    if (!el || isOurButton(el)) return false;
    var tag = el.tagName;
    if (tag !== "BUTTON" && tag !== "A" && el.getAttribute("role") !== "button") {
      return false;
    }

    var compact = compactText(el);
    if (/^(分享|Share|共有)$/i.test(compact)) return true;
    if (compact.length <= 8 && /(分享|Share)/i.test(compact)) return true;

    var aria = (
      (el.getAttribute("aria-label") || "") +
      " " +
      (el.getAttribute("title") || "")
    ).trim();
    if (/^(分享|Share)$/i.test(aria) || /分享/.test(aria)) return true;

    var clickHint =
      (el.getAttribute("@click") || "") +
      (el.getAttribute("x-on:click") || "") +
      (el.getAttribute("x-on:click.prevent") || "") +
      (el.getAttribute("wire:click") || "");
    if (/share/i.test(clickHint) && /modal|open|true|show/i.test(clickHint)) {
      return true;
    }

    var svg = el.querySelector("svg");
    if (svg) {
      var markup = svg.innerHTML || "";
      if (markup.indexOf("M8.684") !== -1) return true;
      if (markup.indexOf("m0 2.684a3 3") !== -1) return true;
    }
    return false;
  }

  function findToolbar() {
    var share = findShareButton();
    if (!share) return null;
    var el = share;
    var i;
    for (i = 0; i < 8 && el; i++) {
      var cls = el.className && el.className.toString ? el.className.toString() : "";
      var buttons = el.querySelectorAll ? el.querySelectorAll("button").length : 0;
      if ((/\bflex\b/.test(cls) || /\btoolbar\b/.test(cls)) && buttons >= 1) {
        return el;
      }
      el = el.parentElement;
    }
    return share.parentElement;
  }

  function hideAdsBelowToolbar() {
    var row = findToolbar();
    if (!row) return;
    var node = row.nextElementSibling;
    var hops = 0;
    while (node && hops < 5) {
      hops += 1;
      var next = node.nextElementSibling;
      if (looksLikeContent(node)) break;
      if (looksLikeAd(node)) hideNode(node);
      node = next;
    }
  }

  function stripPlayerOverlays() {
    var roots = document.querySelectorAll(
      "#player, #video, [data-demo-player], .plyr, .jwplayer, video.player"
    );
    var r;
    for (r = 0; r < roots.length; r++) {
      var box = roots[r].closest ? roots[r].closest("div") : roots[r].parentElement;
      var scope = box || roots[r];
      var links = scope.querySelectorAll(
        'a[target="_blank"], a[rel="sponsored"], a[href*="myavlive"], a[href*="bit.ly"]'
      );
      var i;
      for (i = 0; i < links.length; i++) hideNode(links[i]);
    }
  }

  function hideDesktopSidebar() {
    var nodes;
    var i;
    var el;
    if (!isWatchPath()) return;
    nodes = document.querySelectorAll(
      '[class*="lg:flex"][style*="min-width: 300px"], [class*="lg:flex"][style*="max-width: 300px"]'
    );
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (looksLikeVideoCard(el) || looksLikeContent(el)) continue;
      if (el.querySelector && el.querySelector("video, h1, [" + CTRL_ATTR + "], #player, .plyr")) {
        continue;
      }
      if (!looksLikeAd(el) && !looksLikeAdMarkup(el)) continue;
      hideNode(el);
    }
  }

  function isOurUi(el) {
    return (
      el &&
      (el.id === BTN_ID ||
        el.id === "via-missav-toast" ||
        el.id === "via-missav-seek-hint" ||
        el.id === "via-missav-overlay" ||
        el.id === "via-missav-layer" ||
        el.id === "via-missav-hud" ||
        el.id === "via-missav-stats" ||
        el.id === "via-missav-quality-btn" ||
        el.id === "via-missav-quality" ||
        el.id === "via-missav-play" ||
        el.id === "via-missav-seekbar" ||
        el.getAttribute(CTRL_ATTR) === "1" ||
        el.getAttribute(BTN_ATTR) === "1")
    );
  }

  function containsProtected(el) {
    var videos;
    var i;
    if (!el || !el.querySelector) return false;
    if (el.querySelector("h1, #" + BTN_ID + ", #via-missav-toast, [" + CTRL_ATTR + "]")) return true;
    videos = el.querySelectorAll("video");
    for (i = 0; i < videos.length; i++) {
      if (isMainPlayer(videos[i])) return true;
    }
    return false;
  }

  function looksLikeAdMarkup(el) {
    var blob =
      ((el.id || "") +
        " " +
        (el.className && el.className.toString ? el.className.toString() : "") +
        " " +
        (el.getAttribute("src") || "") +
        " " +
        (el.getAttribute("data-src") || ""))
        .toLowerCase();
    if (AD_HOST_RE.test(blob)) return true;
    if (/tsyndicate|exoclick|juicyads|myavlive|adsbygoogle|inpage|popunder|popmag|hilltop|adsterra|liveef/.test(blob)) {
      return true;
    }
    try {
      return /tsyndicate|exoclick|juicyads|myavlive|adsbygoogle|inpage.push|campaignid|liveef/i.test(
        (el.outerHTML || "").slice(0, 2500)
      );
    } catch (e) {
      return false;
    }
  }

  function inRecommendCard(el) {
    var node = el;
    var hops = 0;
    var cls;
    if (!el) return false;
    if ((el.id || "").indexOf("preview-") === 0) return true;
    while (node && node.nodeType === 1 && hops < 8) {
      if (node === document.body || node === document.documentElement) return false;
      cls = node.className && node.className.toString ? node.className.toString() : "";
      if (/thumbnail|preview/.test(cls) && !/\bplyr\b|\bplayer\b/.test(cls)) return true;
      node = node.parentElement;
      hops += 1;
    }
    return false;
  }

  function screenView() {
    var vv = window.visualViewport;
    var width = window.innerWidth || 1;
    var height = window.innerHeight || 1;
    var left = 0;
    var top = 0;
    if (vv && vv.width > 0 && vv.height > 0) {
      width = vv.width;
      height = vv.height;
      left = vv.offsetLeft || 0;
      top = vv.offsetTop || 0;
    }
    return { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
  }

  function cssScreenBox(rect) {
    var dpr;
    var view;
    var ratio;
    if (!rect) return null;
    dpr = window.devicePixelRatio || 1;
    view = screenView();
    if (dpr > 1 && rect.width > view.width * 1.25) {
      ratio = rect.width / dpr / view.width;
      if (ratio > 0.45 && ratio < 1.35) {
        return {
          left: rect.left / dpr,
          top: rect.top / dpr,
          right: rect.right / dpr,
          bottom: rect.bottom / dpr,
          width: rect.width / dpr,
          height: rect.height / dpr
        };
      }
    }
    return rect;
  }

  function isFloatingAd(el) {
    var style;
    var rect;
    var view;
    var z;
    var nearRight;
    var nearBottom;
    var compact;
    var hasMedia;
    var fixed;
    if (!el || el.nodeType !== 1 || isProtected(el) || isOurUi(el) || holdsMainPlayer(el)) return false;
    if (containsProtected(el)) return false;
    if (el.id === "b-a-b" || el.hasAttribute("data-ts-spot")) return true;
    if (el.tagName === "IFRAME" && looksLikeAdMarkup(el)) return true;
    if (!window.getComputedStyle) return looksLikeAdMarkup(el);
    style = window.getComputedStyle(el);
    if (!style) return false;
    fixed = style.position === "fixed" || style.position === "sticky";
    if (!fixed && (inRecommendCard(el) || looksLikeVideoCard(el) || looksLikeContent(el))) return false;
    if (fixed && inRecommendCard(el)) return false;
    if (style.position !== "fixed" && style.position !== "sticky" && style.position !== "absolute") {
      return looksLikeAdMarkup(el) && (el.tagName === "IFRAME" || el.tagName === "VIDEO");
    }
    rect = cssScreenBox(el.getBoundingClientRect());
    view = screenView();
    if (rect.width < 36 || rect.height < 36) return false;
    if (rect.width >= view.width * 0.92 && rect.height >= view.height * 0.55) {
      return looksLikeAdMarkup(el);
    }
    if (rect.width >= view.width * 0.8 && rect.height <= 160 && rect.bottom >= view.bottom - 24) {
      return el.id === "b-a-b" || looksLikeAdMarkup(el);
    }
    z = parseInt(style.zIndex, 10);
    nearRight = rect.right >= view.right - Math.min(220, view.width * 0.28);
    nearBottom = rect.bottom >= view.bottom - Math.min(240, view.height * 0.22);
    compact = rect.width <= 640 && rect.height <= 720;
    hasMedia = Boolean(el.querySelector && el.querySelector("iframe, img, video, a[target='_blank']"));
    if (looksLikeAdMarkup(el)) return true;
    if (/LIVEEF|循环播放|liveef/i.test((el.innerText || "").slice(0, 240))) return true;
    if (el.tagName === "IFRAME" && nearRight && nearBottom) return true;
    if (el.tagName === "VIDEO" && !isMainPlayer(el) && nearRight && nearBottom) return true;
    if (compact && nearRight && nearBottom && (hasMedia || el.tagName === "IFRAME" || el.tagName === "VIDEO")) {
      return true;
    }
    if (
      fixed &&
      nearRight &&
      nearBottom &&
      rect.width <= view.width * 0.72 &&
      rect.height <= view.height * 0.5 &&
      rect.width >= 48 &&
      rect.height >= 48
    ) {
      return true;
    }
    return false;
  }

  function collectFloatCandidates() {
    var list = [];
    var seen = [];
    var add = function (el) {
      var i;
      if (!el || el.nodeType !== 1) return;
      for (i = 0; i < seen.length; i++) {
        if (seen[i] === el) return;
      }
      seen.push(el);
      list.push(el);
    };
    var groups;
    var g;
    var n;
    var i;
    if (document.body) {
      for (n = document.body.firstElementChild; n; n = n.nextElementSibling) add(n);
    }
    if (document.documentElement) {
      for (n = document.documentElement.firstElementChild; n; n = n.nextElementSibling) {
        if (n !== document.head && n !== document.body) add(n);
      }
    }
    groups = [
      "iframe",
      "[data-ts-spot]",
      "#b-a-b",
      "[style*='position:fixed']",
      "[style*='position: fixed']",
      "[class*='fixed']",
      "[id*='ts-']",
      "[id*='ts_']",
      "[class*='ts-']",
      "[class*='inpage']",
      "iframe[src*='smartpop']",
      "iframe[src*='stripcash']",
      "[style*='z-index:999']",
      "[style*='z-index: 999']"
    ];
    for (g = 0; g < groups.length; g++) {
      try {
        n = document.querySelectorAll(groups[g]);
      } catch (e) {
        n = [];
      }
      for (i = 0; i < n.length; i++) add(n[i]);
    }
    return list;
  }

  function hideFloatingAdTree(el) {
    var parent;
    hideNode(el);
    parent = el.parentElement;
    if (
      parent &&
      parent !== document.body &&
      parent !== document.documentElement &&
      !isProtected(parent) &&
      !containsProtected(parent) &&
      parent.childElementCount <= 3 &&
      isFloatingAd(parent)
    ) {
      hideNode(parent);
    }
  }

  function floatingHost(el) {
    var hops = 0;
    var style;
    while (el && hops < 8) {
      if (el === document.body || el === document.documentElement) return null;
      if (isProtected(el) || isOurUi(el) || containsProtected(el)) return null;
      if (window.getComputedStyle) {
        style = window.getComputedStyle(el);
        if (style && (style.position === "fixed" || style.position === "sticky")) {
          return el;
        }
      }
      el = el.parentElement;
      hops += 1;
    }
    return null;
  }

  function sweepCornerHits() {
    var points;
    var p;
    var stack;
    var i;
    var host;
    var view;
    if (!isWatchPath() || !document.elementsFromPoint) return;
    view = screenView();
    points = [
      [view.right - 16, view.bottom - 16],
      [view.right - 48, view.bottom - 48],
      [view.right - 16, view.bottom - 120],
      [view.right - 140, view.bottom - 16],
      [view.right - 80, view.bottom - 80],
      [view.right - 200, view.bottom - 90],
      [view.right - 80, view.bottom - 200],
      [view.right - Math.min(280, view.width * 0.22), view.bottom - 110],
      [view.right - 180, view.bottom - 180]
    ];
    for (p = 0; p < points.length; p++) {
      try {
        stack = document.elementsFromPoint(points[p][0], points[p][1]) || [];
      } catch (e) {
        stack = [];
      }
      for (i = 0; i < stack.length; i++) {
        if (inRecommendCard(stack[i])) continue;
        host = floatingHost(stack[i]);
        if (host && !inRecommendCard(host) && isFloatingAd(host)) hideFloatingAdTree(host);
      }
    }
  }

  function hideCornerVideos() {
    var videos;
    if (!isWatchPath()) return;
    videos = document.querySelectorAll("video, iframe");
    var i;
    var el;
    var host;
    var hops;
    var rect;
    var style;
    var view;
    for (i = 0; i < videos.length; i++) {
      el = videos[i];
      if (holdsMainPlayer(el) || inRecommendCard(el)) continue;
      host = el;
      hops = 0;
      view = screenView();
      while (host && host !== document.body && hops < 7) {
        if (inRecommendCard(host) || looksLikeVideoCard(host) || holdsMainPlayer(host)) break;
        style = window.getComputedStyle ? window.getComputedStyle(host) : null;
        rect = cssScreenBox(host.getBoundingClientRect());
        if (
          style &&
          (style.position === "fixed" || style.position === "sticky") &&
          rect.width >= 72 &&
          rect.width <= Math.min(520, view.width * 0.62) &&
          rect.height >= 72 &&
          rect.height <= 420 &&
          rect.right >= view.right - Math.min(240, view.width * 0.3) &&
          rect.bottom >= view.bottom - Math.min(280, view.height * 0.24)
        ) {
          hideFloatingAdTree(host);
          break;
        }
        host = host.parentElement;
        hops += 1;
      }
    }
  }

  function hideBodyCornerAds() {
    var view;
    var nodes;
    var extra;
    var i;
    var node;
    var style;
    var rect;
    if (!document.body || !window.getComputedStyle) return;
    view = screenView();
    nodes = [];
    for (node = document.body.firstElementChild; node; node = node.nextElementSibling) nodes.push(node);
    try {
      extra = document.querySelectorAll("iframe, video");
    } catch (e) {
      extra = [];
    }
    for (i = 0; i < extra.length; i++) nodes.push(extra[i]);
    for (i = 0; i < nodes.length; i++) {
      node = nodes[i];
      if (!node || node.nodeType !== 1) continue;
      if (holdsMainPlayer(node) || isOurUi(node) || inRecommendCard(node)) continue;
      if (node.tagName === "VIDEO" && isMainPlayer(node)) continue;
      if (node.closest && node.closest("#player, .plyr, .plyr__video-wrapper, #via-missav-hud")) continue;
      style = window.getComputedStyle(node);
      if (!style || (style.position !== "fixed" && style.position !== "sticky")) continue;
      if (style.display === "none" || style.visibility === "hidden") continue;
      rect = cssScreenBox(node.getBoundingClientRect());
      if (!rect || rect.width < 48 || rect.height < 48) continue;
      if (rect.width > view.width * 0.82 || rect.height > view.height * 0.55) continue;
      if (rect.right < view.right - Math.min(200, view.width * 0.3)) continue;
      if (rect.bottom < view.bottom - Math.min(240, view.height * 0.3)) continue;
      hideNode(node);
    }
  }

  function sweepFloatingAds() {
    var nodes = collectFloatCandidates();
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (isFloatingAd(nodes[i])) hideFloatingAdTree(nodes[i]);
    }
    hideCornerVideos();
    sweepCornerHits();
    hideBodyCornerAds();
  }

  function scheduleAdSweep() {
    if (scheduleAdSweep.timer) return;
    scheduleAdSweep.timer = window.setTimeout(function () {
      scheduleAdSweep.timer = 0;
      sweepFloatingAds();
      hideLoopStrip();
    }, 80);
  }

  function startFloatingAdWatch() {
    if (startFloatingAdWatch.started) return;
    startFloatingAdWatch.started = true;
    var obs = new MutationObserver(scheduleAdSweep);
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "id", "src", "hidden"]
    });
    window.setInterval(function () {
      revealPlayer();
      restoreMistakenContent();
      hideLoopStrip();
      sweepFloatingAds();
    }, 1000);
    revealPlayer();
    restoreMistakenContent();
    hideLoopStrip();
    sweepFloatingAds();
  }

  function hideKnownAds() {
    var selectors = [
      '.relative > div[x-init*="campaignId=under_player"]',
      'div[x-init*="campaignId=under_player"]',
      '[class*="under_player"]',
      "div.ts-outstream-video",
      '[class*="ts-outstream"]',
      "[data-ts-spot]",
      "#b-a-b",
      'div[x-init*="#genki-counter"]',
      'img[alt="MissAV takeover Fanza"]',
      "ul.mb-4.list-none.text-nord14",
      'iframe[src*="tsyndicate"]',
      'iframe[src*="exoclick"]',
      'iframe[src*="juicyads"]',
      'iframe[src*="myavlive"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="inpage.push"]',
      '[id*="tsyndicate"]',
      '[class*="ts-inpage"]',
      '[class*="inpage-push"]',
      'a[href*="go.myavlive.com"]',
      'a[href*="myavlive.com"]',
      'a[href*="//bit.ly/"]',
      'div[class*="fixed"][class*="bottom-"][class*="right-"]',
      'div[class*="fixed"][class*="right-"][class*="bottom-"]',
      'iframe[src*="liveef"]',
      '[class*="liveef"]',
      '[id*="liveef"]'
    ];
    var i;
    var n;
    var nodes;
    for (i = 0; i < selectors.length; i++) {
      try {
        nodes = document.querySelectorAll(selectors[i]);
      } catch (e) {
        nodes = [];
      }
      for (n = 0; n < nodes.length; n++) {
        var el = nodes[n];
        hideNode(el);
        if (el.tagName === "A" || el.tagName === "IFRAME" || el.hasAttribute("data-ts-spot")) {
          var parent = el.parentElement;
          if (parent && looksLikeAd(parent) && !isProtected(parent)) hideNode(parent);
        }
      }
    }
    revealPlayer();
    restoreMistakenContent();
    hideDesktopSidebar();
    sweepFloatingAds();
    hideAdsBelowToolbar();
    stripPlayerOverlays();
    hideLoopStrip();
  }

  function getTitle() {
    var h1 = $("h1");
    var title = textOf(h1);
    if (title) return title;
    var og = $('meta[property="og:title"]');
    if (og) {
      var content = og.getAttribute("content");
      if (content) return content.replace(/\s+/g, " ").trim();
    }
    return (document.title || "").replace(/\s*[-|·].*$/, "").trim();
  }

  function getCode(title) {
    var path = location.pathname || "";
    var pathMatch = path.match(/\/([a-z]{2,12}-\d{2,6}[a-z0-9]*)(?:-|$)/i);
    if (pathMatch) return pathMatch[1].toUpperCase();
    var titleMatch = (title || "").match(
      /^([A-Z0-9]{2,12}-?\d{2,6}(?:-[A-Z0-9]+)?)/i
    );
    if (titleMatch) return titleMatch[1].toUpperCase();
    return "";
  }

  function payload() {
    var title = getTitle();
    var code = getCode(title);
    var lines = [];
    if (code) lines.push(code);
    if (title && title !== code) lines.push(title);
    lines.push(location.href);
    return { code: code, title: title, text: lines.join("\n") };
  }

  function execCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!execCopy(text)) throw new Error("copy failed");
      });
    }
    return execCopy(text)
      ? Promise.resolve()
      : Promise.reject(new Error("copy failed"));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#" +
      BTN_ID +
      "{display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;}" +
      "#" +
      BTN_ID +
      " svg{width:1.25rem;height:1.25rem;flex:none;}" +
      "#via-missav-toast{position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%);" +
      "z-index:2147483647;padding:.65rem 1rem;border-radius:999px;font-size:14px;line-height:1.3;" +
      "background:rgba(46,52,64,.96);color:#eceff4;border:1px solid #4c566a;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:none;max-width:90vw;}" +
      "#via-missav-toast[data-state='error']{border-color:#bf616a;color:#eceff4;}" +
      "#via-missav-layer{display:none!important;}" +
      "#via-missav-magnets{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483200;display:none;}" +
      "#via-missav-magnets.via-open{display:block;}" +
      "#via-missav-magnets .via-m-back{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.52);}" +
      "#via-missav-magnets .via-m-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:640px;max-height:72%;" +
      "overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;background:#2e3440;color:#eceff4;" +
      "border-radius:14px 14px 0 0;box-shadow:0 -8px 28px rgba(0,0,0,.5);padding-bottom:.6rem;}" +
      "#via-missav-magnets .via-m-head{padding:.8rem 1rem .5rem;font-size:14px;color:rgba(236,239,244,.7);}" +
      "#via-missav-magnets .via-m-item{appearance:none;-webkit-appearance:none;display:block;width:100%;box-sizing:border-box;" +
      "margin:0;padding:.7rem 1rem;background:transparent;border:0;border-top:1px solid rgba(255,255,255,.08);" +
      "color:inherit;font:inherit;text-align:left;line-height:1.35;}" +
      "#via-missav-magnets .via-m-item:active{background:rgba(255,255,255,.07);}" +
      "#via-missav-magnets .via-m-name{display:block;font-size:14px;color:#ebcb8b;word-break:break-all;}" +
      "#via-missav-magnets .via-m-tag{display:inline-block;margin-left:.5em;padding:0 .45em;border-radius:4px;" +
      "font-size:12px;color:#fff;background:#bf616a;vertical-align:baseline;}" +
      "#via-missav-magnets .via-m-meta{display:block;margin-top:.15rem;font-size:12px;color:rgba(236,239,244,.6);}" +
      "[" +
      CTRL_ATTR +
      "='1'],[data-via-missav-site-seek='1']{display:none!important;}";
    parent.appendChild(style);
  }

  function searchIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("d", "M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z");
    svg.appendChild(path);
    return svg;
  }

  function btsowUrl(code) {
    return "https://btsow.live/search/" + encodeURIComponent(code);
  }

  /* 用一次临时链接点击在新标签打开，不受我们对 window.open 的广告拦截影响 */
  function openExternal(url) {
    var a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    (document.body || document.documentElement).appendChild(a);
    a.click();
    window.setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 0);
  }

  /* ---- 视频下方“下载”：弹出页面「磁力下载」里的列表 ---- */

  var MAGNET_ID = "via-missav-magnets";

  function readMagnets() {
    var anchors = document.querySelectorAll('a[href^="magnet:"]');
    var seen = {};
    var list = [];
    var i;
    var a;
    var href;
    var row;
    var meta;
    var tags;
    var spans;
    var s;
    var text;
    for (i = 0; i < anchors.length; i++) {
      a = anchors[i];
      href = a.getAttribute("href") || "";
      if (!href || seen[href]) continue;
      seen[href] = 1;
      row = a.closest ? a.closest("tr") : null;
      if (!row) row = a.parentElement;
      meta = textOf(row);
      tags = [];
      spans = row ? row.querySelectorAll("span") : [];
      for (s = 0; s < spans.length; s++) {
        text = textOf(spans[s]);
        if (text && text.length <= 8 && !a.contains(spans[s]) && tags.indexOf(text) === -1) tags.push(text);
      }
      list.push({
        href: href,
        name: textOf(a) || href.slice(0, 60),
        tags: tags,
        size: (meta.match(/\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB)/i) || [""])[0],
        date: (meta.match(/\d{4}-\d{2}-\d{2}/) || [""])[0]
      });
    }
    return list;
  }

  function closeMagnets() {
    var wrap = document.getElementById(MAGNET_ID);
    if (wrap) wrap.classList.remove("via-open");
  }

  function openMagnets() {
    var items = readMagnets();
    var wrap;
    var sheet;
    var head;
    var back;
    var i;
    if (!items.length) {
      toast("这个视频没有磁力下载", true);
      return;
    }
    ensureStyles();
    wrap = document.getElementById(MAGNET_ID);
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = document.createElement("div");
    wrap.id = MAGNET_ID;
    wrap.setAttribute("data-via-missav-keep", "1");
    back = document.createElement("div");
    back.className = "via-m-back";
    back.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      closeMagnets();
    });
    sheet = document.createElement("div");
    sheet.className = "via-m-sheet";
    head = document.createElement("div");
    head.className = "via-m-head";
    head.textContent = "磁力下载（点击复制链接）";
    sheet.appendChild(head);
    for (i = 0; i < items.length; i++) {
      sheet.appendChild(magnetItem(items[i]));
    }
    wrap.appendChild(back);
    wrap.appendChild(sheet);
    (document.body || document.documentElement).appendChild(wrap);
    wrap.classList.add("via-open");
  }

  function magnetItem(item) {
    var btn = document.createElement("button");
    var name = document.createElement("span");
    var meta = document.createElement("span");
    var parts = [];
    var i;
    var tag;
    btn.type = "button";
    btn.className = "via-m-item";
    name.className = "via-m-name";
    name.appendChild(document.createTextNode(item.name));
    for (i = 0; i < item.tags.length; i++) {
      tag = document.createElement("span");
      tag.className = "via-m-tag";
      tag.textContent = item.tags[i];
      name.appendChild(tag);
    }
    meta.className = "via-m-meta";
    if (item.size) parts.push(item.size);
    if (item.date) parts.push(item.date);
    meta.textContent = parts.join("  ·  ");
    btn.appendChild(name);
    if (parts.length) btn.appendChild(meta);
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      copyText(item.href)
        .then(function () {
          toast("已复制磁力链接");
        })
        .catch(function () {
          toast("复制失败，请长按选择文本", true);
        });
    });
    return btn;
  }

  function magnetEntry(node) {
    var a = node && node.closest ? node.closest("a") : null;
    var row;
    var text;
    if (!a) return null;
    if (compactText(a) !== "下载") return null;
    if (a.closest && a.closest("table, .plyr, #player")) return null;
    row = a.parentElement;
    if (!row) return null;
    text = compactText(row);
    if (text.indexOf("收藏") === -1 || !/片单|片單/.test(text)) return null;
    return a;
  }

  function armMagnetDownload() {
    var links = document.querySelectorAll("a");
    var i;
    var a;
    for (i = 0; i < links.length; i++) {
      a = links[i];
      if (a.getAttribute("data-via-missav-magnet") === "1") continue;
      if (!magnetEntry(a)) continue;
      a.setAttribute("data-via-missav-magnet", "1");
      a.setAttribute("data-via-missav-href", a.getAttribute("href") || "");
      a.setAttribute("href", "#");
      a.removeAttribute("target");
    }
    if (armMagnetDownload.listening) return;
    armMagnetDownload.listening = true;
    document.addEventListener(
      "click",
      function (event) {
        var entry = magnetEntry(event.target);
        if (!entry) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openMagnets();
      },
      true
    );
  }

  function parentGap(el) {
    var parent = el.parentElement;
    if (!parent || !window.getComputedStyle) return 0;
    var gap = window.getComputedStyle(parent).gap;
    if (!gap || gap === "normal") return 0;
    var n = parseFloat(gap);
    return isNaN(n) ? 0 : n;
  }

  function createButton(shareBtn) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = BTN_ID;
    btn.setAttribute(BTN_ATTR, "1");
    btn.className = shareBtn.className || "";
    btn.setAttribute("aria-label", "在 BTSOW 搜索番号");

    var icon = searchIcon();
    var shareSvg = shareBtn.querySelector("svg");
    if (shareSvg && shareSvg.getAttribute("class")) {
      icon.setAttribute("class", shareSvg.getAttribute("class"));
    }
    btn.appendChild(icon);

    var shareSpan = shareBtn.querySelector("span");
    var label = document.createElement("span");
    if (shareSpan && shareSpan.className) label.className = shareSpan.className;
    label.textContent = "BTSOW";
    btn.appendChild(label);

    if (!parentGap(shareBtn)) {
      btn.style.marginLeft = "8px";
    }

    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var data = payload();
      if (!data.code) {
        toast("没有找到番号", true);
        return;
      }
      openExternal(btsowUrl(data.code));
    });
    return btn;
  }

  function insertCopyButton() {
    if (document.getElementById(BTN_ID)) return true;
    var shareBtn = findShareButton();
    if (!shareBtn || !shareBtn.parentNode) return false;
    ensureStyles();
    shareBtn.insertAdjacentElement("afterend", createButton(shareBtn));
    return true;
  }

  function classNames(el) {
    if (!el || !el.classList) return [];
    return Array.prototype.slice.call(el.classList);
  }

  function isSmHiddenClass(name) {
    return /(^|-)sm:hidden$/.test(name || "");
  }

  function clickSource(el) {
    var text = "";
    var names;
    var i;
    if (!el || !el.getAttributeNames) return "";
    names = el.getAttributeNames();
    for (i = 0; i < names.length; i++) {
      if (/click/i.test(names[i])) text += " " + (el.getAttribute(names[i]) || "");
    }
    return text;
  }

  function isSeekButton(el) {
    if (!el || el.tagName !== "BUTTON") return false;
    if (/currentTime\s*[+\-]=/.test(clickSource(el))) return true;
    return /^[+\-]?\d+\s*(m|s)$/i.test(compactText(el));
  }

  function seekButtonCount(el) {
    var buttons;
    var i;
    var n;
    if (!el || !el.querySelectorAll) return 0;
    buttons = el.querySelectorAll("button");
    n = 0;
    for (i = 0; i < buttons.length; i++) {
      if (isSeekButton(buttons[i])) n += 1;
    }
    return n;
  }

  function isSeekBar(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.querySelector && el.querySelector("video, h1, table")) return false;
    if (seekButtonCount(el) < 4) return false;
    if (el.offsetHeight && el.offsetHeight > 160) return false;
    return classNames(el).some(isSmHiddenClass) || el.getAttribute(CTRL_ATTR) === "1";
  }

  function findControlBar() {
    var marked = document.querySelector("[" + CTRL_ATTR + "='1']");
    var buttons;
    var i;
    var el;
    var hops;
    if (marked && isSeekBar(marked)) return marked;
    if (marked && !isSeekBar(marked)) {
      marked.removeAttribute(CTRL_ATTR);
      marked.removeAttribute("data-via-missav-smhide");
      marked.removeAttribute("data-via-missav-fs");
    }
    buttons = document.querySelectorAll("button");
    for (i = 0; i < buttons.length; i++) {
      if (!isSeekButton(buttons[i])) continue;
      el = buttons[i].parentElement;
      hops = 0;
      while (el && hops < 6) {
        if (isSeekBar(el)) return el;
        el = el.parentElement;
        hops += 1;
      }
    }
    return null;
  }

  function savedHideClasses(bar) {
    var saved = bar.getAttribute("data-via-missav-smhide");
    if (saved !== null) return saved.split(/\s+/).filter(Boolean);
    saved = classNames(bar).filter(isSmHiddenClass);
    bar.setAttribute("data-via-missav-smhide", saved.join(" "));
    return saved;
  }

  function fullscreenRoot() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) return fs;
    return document.querySelector(
      ".plyr--fullscreen-active, .plyr--fullscreen-fallback"
    );
  }

  function rememberControlHome(bar) {
    if (bar.__viaParent) return;
    bar.__viaParent = bar.parentElement;
    bar.__viaNext = bar.nextSibling;
  }

  function restoreControlHome(bar) {
    var parent = bar.__viaParent;
    if (!parent || bar.parentElement === parent) {
      bar.removeAttribute("data-via-missav-fs");
      return;
    }
    if (bar.__viaNext && bar.__viaNext.parentElement === parent) {
      parent.insertBefore(bar, bar.__viaNext);
    } else {
      parent.appendChild(bar);
    }
    bar.removeAttribute("data-via-missav-fs");
  }

  function playerOverlayHost() {
    return (
      fullscreenRoot() ||
      document.querySelector(".plyr--fullscreen-active, .plyr--fullscreen-fallback, .plyr, #player")
    );
  }

  function placeControlBar(bar) {
    var root = playerOverlayHost();
    if (root) {
      rememberControlHome(bar);
      if (bar.parentElement !== root) root.appendChild(bar);
      bar.setAttribute("data-via-missav-fs", "1");
      return;
    }
    restoreControlHome(bar);
  }

  function hookPlayerFullscreen() {
    var player = window.player;
    if (!player || player.__viaFsHook || typeof player.on !== "function") return;
    player.__viaFsHook = true;
    try {
      player.on("enterfullscreen", keepLandscapeControls);
      player.on("exitfullscreen", keepLandscapeControls);
    } catch (e) {}
  }

  function keepLandscapeControls() {
    var bar = findControlBar();
    hookPlayerFullscreen();
    if (!bar) return;
    bar.setAttribute(CTRL_ATTR, "1");
    bar.setAttribute("data-via-missav-site-seek", "1");
  }

  function startDomWork() {
    injectAdCss();
    insertCopyButton();
    armMagnetDownload();
    restoreMistakenContent();
    hideKnownAds();
    disablePopHandlers();
    keepLandscapeControls();
    injectPageGestureHook();
    startFloatingAdWatch();

    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      insertCopyButton();
      armMagnetDownload();
      hideKnownAds();
      disablePopHandlers();
      keepLandscapeControls();
      if (tries >= MAX_TRIES) window.clearInterval(timer);
    }, TRY_EVERY_MS);

    var last = 0;
    var obs = new MutationObserver(function () {
      var now = Date.now();
      if (now - last < 200) return;
      last = now;
      insertCopyButton();
      armMagnetDownload();
      hideKnownAds();
      disablePopHandlers();
      keepLandscapeControls();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener("orientationchange", keepLandscapeControls);
    window.addEventListener("resize", keepLandscapeControls);
    document.addEventListener("fullscreenchange", keepLandscapeControls);
    document.addEventListener("webkitfullscreenchange", keepLandscapeControls);
  }

  installOpenHook();
  installLocationHooks();
  installClickGuard();
  injectPageGestureHook();
  disablePopHandlers();
  injectAdCss();
  startFloatingAdWatch();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDomWork);
  } else {
    startDomWork();
  }
})();
