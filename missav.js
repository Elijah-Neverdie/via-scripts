// ==UserScript==
// @name         MissAV Via 辅助
// @namespace    missav-via-extra-button
// @version      1.4.5
// @description  单击开关原生播放器控制条，双击快进快退/播放暂停，持续屏蔽右下角广告
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
    var v = document.querySelector("video.player, #player video, video");
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
      var v = document.querySelector("video.player, video");
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

  function injectPageOpenHook() {
    try {
      if (document.documentElement.getAttribute("data-via-missav-hooked") === "1") {
        return;
      }
      document.documentElement.setAttribute("data-via-missav-hooked", "1");
      var script = document.createElement("script");
      script.textContent = "(" + pageOpenHook.toString() + ")();";
      document.documentElement.appendChild(script);
      if (script.parentNode) script.parentNode.removeChild(script);
    } catch (e) {}
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
    if (window.__viaMissavGestureHook === 10) return;
    window.__viaMissavGestureHook = 10;
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

    function videoEl() {
      return document.querySelector("video.player, #player video, .plyr video, video");
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
          ".plyr__controls,.plyr__menu,.plyr__progress,[data-via-missav-controls],#via-missav-extra-btn,#via-missav-seekbar"
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

    function boxRect() {
      var list = [];
      var v = videoEl();
      var fs = fsNode();
      var i;
      var el;
      var rect;
      if (fs) list.push(fs);
      if (v) {
        list.push(v);
        if (v.closest) {
          list.push(v.closest(".plyr__video-wrapper"));
          list.push(v.closest(".plyr"));
          list.push(v.closest("#player"));
        }
      }
      list.push(document.querySelector(".plyr__video-wrapper"));
      list.push(playerRoot());
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (!el || !el.getBoundingClientRect) continue;
        rect = el.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 80) return rect;
      }
      return {
        left: 0,
        top: 0,
        width: window.innerWidth || 1,
        height: window.innerHeight || 1
      };
    }

    function zoneFromPoint(x) {
      var rect = boxRect();
      var width = rect.width || 1;
      var local = x - rect.left;
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
      var player = window.player;
      var video = videoEl();
      if (player && typeof player.currentTime === "number") {
        player.currentTime = clampTime(player.currentTime + delta, player.duration);
        return;
      }
      if (video) {
        video.currentTime = clampTime((video.currentTime || 0) + delta, video.duration);
      }
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
        "#via-missav-hud{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;overflow:hidden;display:none;}" +
        "#via-missav-hud.via-hud-on{display:block;}" +
        "#via-missav-hud .via-side{position:absolute;top:0;bottom:0;width:33.333%;display:flex;align-items:center;justify-content:center;opacity:0;}" +
        "#via-missav-hud .via-side.left{left:0;}" +
        "#via-missav-hud .via-side.right{left:66.667%;}" +
        "#via-missav-hud .via-side.on{opacity:1!important;visibility:visible!important;animation:via-seek-fade .9s ease forwards;}" +
        "#via-missav-hud .via-face{position:relative;z-index:1;color:#fff;font-weight:400;letter-spacing:0;line-height:1;" +
        "padding:0;margin:0;border:0;border-radius:0;background:transparent;" +
        "text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.65);}" +
        "#via-missav-hud .via-flash{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:72px;height:72px;border-radius:100%;background:rgba(0,0,0,.58);color:#fff;display:none;align-items:center;justify-content:center;}" +
        "#via-missav-hud .via-flash.on{display:flex;animation:via-play-pulse .4s ease;}" +
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

    function pinHud(wrap) {
      var rect = boxRect();
      var fs = fsNode();
      var scale;
      var faces;
      var i;
      var px;
      if (!wrap) return;
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
      wrap.style.left = (rect.left || 0) + "px";
      wrap.style.top = (rect.top || 0) + "px";
      wrap.style.width = (rect.width || 0) + "px";
      wrap.style.height = (rect.height || 0) + "px";
      wrap.style.zIndex = "2147483646";
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
      mount = fsNode() || document.body || document.documentElement;
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
      flash = wrap.querySelector(".via-flash");
      if (flash && !flash.innerHTML) flash.innerHTML = playSvg();
      if (host) ensureSeekBar(host);
      return wrap;
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
      if (chrome(event.target) || !inPlayer(event.target)) return;
      if (event.type === "touchend" && event.touches && event.touches.length) return;
      rememberPoint(event);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
        apply(zoneFromPoint(lastTapX));
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
      apply(zoneFromPoint(lastTapX));
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

    injectStyle();
    removeLegacyLayer();
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
    }, 800);
  }

  function injectPageGestureHook() {
    try {
      if (document.documentElement.getAttribute("data-via-missav-gesture") === "10") {
        return;
      }
      document.documentElement.setAttribute("data-via-missav-gesture", "10");
      var script = document.createElement("script");
      script.textContent = "(" + pageGestureHook.toString() + ")();";
      document.documentElement.appendChild(script);
      if (script.parentNode) script.parentNode.removeChild(script);
    } catch (e) {}
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
        video = document.querySelector("video.player, #player video, video");
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

  function isFloatingAd(el) {
    var style;
    var rect;
    var z;
    var nearRight;
    var nearBottom;
    var compact;
    var hasMedia;
    if (!el || el.nodeType !== 1 || isProtected(el) || isOurUi(el) || holdsMainPlayer(el)) return false;
    if (looksLikeVideoCard(el) || looksLikeContent(el)) return false;
    if (containsProtected(el)) return false;
    if (el.id === "b-a-b" || el.hasAttribute("data-ts-spot")) return true;
    if (el.tagName === "IFRAME" && looksLikeAdMarkup(el)) return true;
    if (!window.getComputedStyle) return looksLikeAdMarkup(el);
    style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.position !== "fixed" && style.position !== "sticky" && style.position !== "absolute") {
      return looksLikeAdMarkup(el) && (el.tagName === "IFRAME" || el.tagName === "VIDEO");
    }
    rect = el.getBoundingClientRect();
    if (rect.width < 36 || rect.height < 36) return false;
    if (rect.width >= window.innerWidth * 0.92 && rect.height >= window.innerHeight * 0.55) {
      return looksLikeAdMarkup(el);
    }
    if (rect.width >= window.innerWidth * 0.8 && rect.height <= 160 && rect.bottom >= window.innerHeight - 24) {
      return el.id === "b-a-b" || looksLikeAdMarkup(el);
    }
    z = parseInt(style.zIndex, 10);
    nearRight = rect.right >= window.innerWidth - 220;
    nearBottom = rect.bottom >= window.innerHeight - 240;
    compact = rect.width <= 640 && rect.height <= 720;
    hasMedia = Boolean(el.querySelector && el.querySelector("iframe, img, video, a[target='_blank']"));
    if (looksLikeAdMarkup(el)) return true;
    if (/LIVEEF|循环播放|liveef/i.test((el.innerText || "").slice(0, 240))) return true;
    if (el.tagName === "IFRAME" && nearRight && nearBottom) return true;
    if (el.tagName === "VIDEO" && !isMainPlayer(el) && nearRight && nearBottom) return true;
    if (compact && nearRight && nearBottom && (hasMedia || el.tagName === "IFRAME" || el.tagName === "VIDEO")) {
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
    if (!isWatchPath() || !document.elementsFromPoint) return;
    points = [
      [window.innerWidth - 16, window.innerHeight - 16],
      [window.innerWidth - 48, window.innerHeight - 48],
      [window.innerWidth - 16, window.innerHeight - 120],
      [window.innerWidth - 140, window.innerHeight - 16],
      [window.innerWidth - 80, window.innerHeight - 80],
      [window.innerWidth - 200, window.innerHeight - 90],
      [window.innerWidth - 80, window.innerHeight - 200],
      [window.innerWidth - 280, window.innerHeight - 110],
      [window.innerWidth - 180, window.innerHeight - 180]
    ];
    for (p = 0; p < points.length; p++) {
      try {
        stack = document.elementsFromPoint(points[p][0], points[p][1]) || [];
      } catch (e) {
        stack = [];
      }
      for (i = 0; i < stack.length; i++) {
        host = floatingHost(stack[i]);
        if (host && isFloatingAd(host)) hideFloatingAdTree(host);
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
    for (i = 0; i < videos.length; i++) {
      el = videos[i];
      if (holdsMainPlayer(el)) continue;
      host = el;
      hops = 0;
      while (host && host !== document.body && hops < 7) {
        rect = host.getBoundingClientRect();
        if (
          !holdsMainPlayer(host) &&
          rect.width >= 72 &&
          rect.width <= Math.min(520, window.innerWidth * 0.62) &&
          rect.height >= 72 &&
          rect.height <= 420 &&
          rect.right >= window.innerWidth - 240 &&
          rect.bottom >= window.innerHeight - 280
        ) {
          hideFloatingAdTree(host);
          break;
        }
        host = host.parentElement;
        hops += 1;
      }
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
      "[" +
      CTRL_ATTR +
      "='1'],[data-via-missav-site-seek='1']{display:none!important;}";
    parent.appendChild(style);
  }

  function clipboardIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "2");
    path.setAttribute(
      "d",
      "M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
    );
    svg.appendChild(path);
    return svg;
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
    btn.setAttribute("aria-label", "复制番号与链接");

    var icon = clipboardIcon();
    var shareSvg = shareBtn.querySelector("svg");
    if (shareSvg && shareSvg.getAttribute("class")) {
      icon.setAttribute("class", shareSvg.getAttribute("class"));
    }
    btn.appendChild(icon);

    var shareSpan = shareBtn.querySelector("span");
    var label = document.createElement("span");
    if (shareSpan && shareSpan.className) label.className = shareSpan.className;
    label.textContent = "复制";
    btn.appendChild(label);

    if (!parentGap(shareBtn)) {
      btn.style.marginLeft = "8px";
    }

    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var data = payload();
      copyText(data.text)
        .then(function () {
          toast(data.code ? "已复制 " + data.code : "已复制标题和链接");
        })
        .catch(function () {
          toast("复制失败，请长按选择文本", true);
        });
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
