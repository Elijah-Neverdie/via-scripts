// ==UserScript==
// @name         MissAV Via 辅助
// @namespace    missav-via-extra-button
// @version      1.3.3
// @description  分享旁复制按钮、持续屏蔽延后悬浮广告，播放器左中右三分区双击快退/播放暂停/快进，跳过首次播放弹窗
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
        ".plyr__controls, .plyr__menu, .plyr__progress, [" + CTRL_ATTR + "], #" + BTN_ID
      )
    );
  }

  function pageGestureHook() {
    if (window.__viaMissavGestureHook) return;
    window.__viaMissavGestureHook = true;
    var SEEK = 15;
    var GAP = 280;
    var pending = 0;
    var lastTouch = 0;
    var lastAction = 0;

    function videoEl() {
      return document.querySelector("video.player, #player video, .plyr video, video");
    }

    function boxEl() {
      var v = videoEl();
      if (v && v.closest) {
        return (
          v.closest(".plyr__video-wrapper") ||
          v.closest(".plyr") ||
          v.closest("#player") ||
          v
        );
      }
      return document.querySelector(".plyr, #player");
    }

    function hintParent() {
      var v = videoEl();
      if (v && v.parentElement && v.tagName === "VIDEO") {
        return (
          v.closest(".plyr__video-wrapper") ||
          v.closest(".plyr") ||
          v.closest("#player") ||
          v.parentElement
        );
      }
      return boxEl();
    }

    function chrome(node) {
      if (!node || !node.closest) return false;
      return Boolean(
        node.closest(
          ".plyr__controls,.plyr__menu,.plyr__progress,[data-via-missav-controls],#via-missav-extra-btn"
        )
      );
    }

    function inPlayer(node) {
      if (!node || !node.closest) return false;
      return Boolean(
        node.closest("#player,#video,.player,video.player,[data-demo-player],.plyr,.jwplayer")
      );
    }

    function pointX(event) {
      if (event.changedTouches && event.changedTouches[0]) return event.changedTouches[0].clientX;
      return event.clientX;
    }

    function zone(event) {
      var box = boxEl();
      if (!box) return "center";
      var rect = box.getBoundingClientRect();
      var width = rect.width || 1;
      var x = pointX(event) - rect.left;
      if (x < width / 3) return "left";
      if (x > (width * 2) / 3) return "right";
      return "center";
    }

    function disablePlyr() {
      var player = window.player;
      if (!player || !player.config) return;
      try {
        player.config.clickToPlay = false;
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

    function togglePlay() {
      var player = window.player;
      var video = videoEl();
      try {
        if (player && typeof player.togglePlay === "function") {
          player.togglePlay();
          return;
        }
        if (player && typeof player.paused === "boolean") {
          if (player.paused) player.play();
          else player.pause();
          return;
        }
      } catch (e) {}
      if (!video) return;
      if (video.paused) {
        var maybe = video.play();
        if (maybe && maybe.catch) maybe.catch(function () {});
      } else {
        video.pause();
      }
    }

    function hint(text) {
      var host = hintParent();
      var el = document.getElementById("via-missav-seek-hint");
      if (!host) return;
      if (!el) {
        el = document.createElement("div");
        el.id = "via-missav-seek-hint";
        el.setAttribute("data-via-missav-keep", "1");
        el.style.cssText =
          "position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:8;" +
          "padding:.45rem .85rem;border-radius:999px;font-size:15px;line-height:1.2;" +
          "background:rgba(0,0,0,.62);color:#fff;pointer-events:none;white-space:nowrap;";
        if (window.getComputedStyle && window.getComputedStyle(host).position === "static") {
          host.style.position = "relative";
        }
        host.appendChild(el);
      } else if (el.parentElement !== host) {
        host.appendChild(el);
      }
      el.textContent = text;
      el.style.display = "block";
      if (hint.timer) window.clearTimeout(hint.timer);
      hint.timer = window.setTimeout(function () {
        el.style.display = "none";
      }, 700);
    }

    function apply(side) {
      lastAction = Date.now();
      if (side === "left") {
        seekBy(-SEEK);
        hint("−15 秒");
        return;
      }
      if (side === "right") {
        seekBy(SEEK);
        hint("+15 秒");
        return;
      }
      togglePlay();
    }

    function onTap(event) {
      if (chrome(event.target) || !inPlayer(event.target)) return;
      if (event.type === "touchend" && event.touches && event.touches.length) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
        apply(zone(event));
        return;
      }
      pending = window.setTimeout(function () {
        pending = 0;
        togglePlay();
      }, GAP);
    }

    function onDblClick(event) {
      if (chrome(event.target) || !inPlayer(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (Date.now() - lastAction < 400) return;
      if (pending) {
        window.clearTimeout(pending);
        pending = 0;
      }
      apply(zone(event));
    }

    document.addEventListener(
      "touchend",
      function (event) {
        lastTouch = Date.now();
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
    document.addEventListener("dblclick", onDblClick, true);
    disablePlyr();
    window.setInterval(disablePlyr, 800);
  }

  function injectPageGestureHook() {
    try {
      if (document.documentElement.getAttribute("data-via-missav-gesture") === "1") {
        return;
      }
      document.documentElement.setAttribute("data-via-missav-gesture", "1");
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
    if (document.getElementById(AD_STYLE_ID)) return;
    var parent = document.head || document.documentElement;
    if (!parent) return;
    var style = document.createElement("style");
    style.id = AD_STYLE_ID;
    style.textContent =
      '.relative>div[x-init*="campaignId=under_player"],' +
      'div[x-init*="campaignId=under_player"],' +
      '[class*="under_player"],' +
      'div[x-init*="#genki-counter"],' +
      "div.ts-outstream-video," +
      '[class*="ts-outstream"],' +
      '[data-ts-spot],' +
      '#b-a-b,' +
      'div[class*="fixed"][class*="bottom-"][class*="right-"],' +
      'div[class*="fixed"][class*="right-"][class*="bottom-"],' +
      '[class*="lg:flex"][style*="min-width: 300px"],' +
      '[class*="lg:flex"][style*="max-width: 300px"],' +
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
      'html > iframe,' +
      '[id*="tsyndicate"],' +
      '[class*="ts-inpage"],' +
      '[class*="inpage-push"],' +
      'body > div:has(iframe[src*="tsyndicate"]),' +
      'body > div:has(iframe[src*="exoclick"]),' +
      'body > div:has(iframe[src*="juicyads"]),' +
      '[data-via-missav-ad="1"]{display:none!important;pointer-events:none!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;}';
    parent.appendChild(style);
  }

  function isProtected(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    if (el.id === BTN_ID || el.id === "player" || el.id === "video") return true;
    if (el.getAttribute(BTN_ATTR) === "1") return true;
    if (el.getAttribute("data-demo-player") === "1") return true;
    if (el.getAttribute("data-via-missav-keep") === "1") return true;
    if (el.getAttribute(CTRL_ATTR) === "1") return true;
    if (el.tagName === "VIDEO" || el.tagName === "H1") return true;
    var cls = el.className && el.className.toString ? el.className.toString() : "";
    return /\b(toolbar|missav-shell|tags|info-table|player|video-title)\b/.test(cls);
  }

  function hideNode(el) {
    if (!el || isProtected(el)) return;
    if (el.getAttribute("data-via-missav-ad") === "1") return;
    el.setAttribute("data-via-missav-ad", "1");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("pointer-events", "none", "important");
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
    var nodes = document.querySelectorAll(
      '[class*="lg:flex"][style*="min-width: 300px"], [class*="lg:flex"][style*="max-width: 300px"]'
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].querySelector && nodes[i].querySelector("video, h1, [" + CTRL_ATTR + "]")) {
        continue;
      }
      hideNode(nodes[i]);
    }
  }

  function isOurUi(el) {
    return (
      el &&
      (el.id === BTN_ID ||
        el.id === "via-missav-toast" ||
        el.id === "via-missav-seek-hint" ||
        el.getAttribute(CTRL_ATTR) === "1" ||
        el.getAttribute(BTN_ATTR) === "1")
    );
  }

  function containsProtected(el) {
    if (!el || !el.querySelector) return false;
    return Boolean(
      el.querySelector("video, h1, #" + BTN_ID + ", #via-missav-toast, [" + CTRL_ATTR + "]")
    );
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
    if (/tsyndicate|exoclick|juicyads|myavlive|adsbygoogle|inpage|popunder|popmag|hilltop|adsterra/.test(blob)) {
      return true;
    }
    try {
      return /tsyndicate|exoclick|juicyads|myavlive|adsbygoogle|inpage.push|campaignid/i.test(
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
    if (!el || el.nodeType !== 1 || isProtected(el) || isOurUi(el)) return false;
    if (containsProtected(el)) return false;
    if (el.id === "b-a-b" || el.hasAttribute("data-ts-spot")) return true;
    if (el.tagName === "IFRAME" && looksLikeAdMarkup(el)) return true;
    if (!window.getComputedStyle) return looksLikeAdMarkup(el);
    style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.position !== "fixed" && style.position !== "sticky") {
      return looksLikeAdMarkup(el) && el.tagName === "IFRAME";
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
    nearRight = rect.right >= window.innerWidth - 180;
    nearBottom = rect.bottom >= window.innerHeight - 180;
    compact = rect.width <= 640 && rect.height <= 720;
    hasMedia = Boolean(el.querySelector && el.querySelector("iframe, img, video, a[target='_blank']"));
    if (looksLikeAdMarkup(el)) return true;
    if (compact && nearRight && nearBottom && (hasMedia || isNaN(z) || z >= 5)) return true;
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
      "[class*='inpage']"
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
    if (!document.elementsFromPoint) return;
    points = [
      [window.innerWidth - 16, window.innerHeight - 16],
      [window.innerWidth - 48, window.innerHeight - 48],
      [window.innerWidth - 16, window.innerHeight - 120],
      [window.innerWidth - 140, window.innerHeight - 16]
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

  function sweepFloatingAds() {
    var nodes = collectFloatCandidates();
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (isFloatingAd(nodes[i])) hideFloatingAdTree(nodes[i]);
    }
    sweepCornerHits();
  }

  function scheduleAdSweep() {
    if (scheduleAdSweep.timer) return;
    scheduleAdSweep.timer = window.setTimeout(function () {
      scheduleAdSweep.timer = 0;
      sweepFloatingAds();
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
    window.setInterval(sweepFloatingAds, 1000);
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
      'div[class*="fixed"][class*="right-"][class*="bottom-"]'
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
    hideDesktopSidebar();
    sweepFloatingAds();
    hideAdsBelowToolbar();
    stripPlayerOverlays();
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
      "[" +
      CTRL_ATTR +
      "='1'][data-via-missav-fs='1']{display:flex!important;visibility:visible!important;opacity:1!important;" +
      "position:absolute!important;left:0;right:0;bottom:4.6rem;z-index:4;justify-content:space-between;" +
      "padding:.35rem .5rem;background:rgba(0,0,0,.62);pointer-events:auto;}";
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

  function isPhoneLandscape() {
    var touch = navigator.maxTouchPoints > 0;
    var landscape = false;
    try {
      landscape = window.matchMedia("(orientation: landscape)").matches;
    } catch (e) {
      landscape = window.innerWidth > window.innerHeight;
    }
    return touch && landscape;
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

  function placeControlBar(bar, force) {
    var root = force ? fullscreenRoot() : null;
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
    var hideClasses;
    var i;
    var force;
    hookPlayerFullscreen();
    if (!bar) return;
    bar.setAttribute(CTRL_ATTR, "1");
    hideClasses = savedHideClasses(bar);
    force = !!fullscreenRoot();
    if (isPhoneLandscape() || force) {
      for (i = 0; i < hideClasses.length; i++) bar.classList.remove(hideClasses[i]);
    } else {
      for (i = 0; i < hideClasses.length; i++) bar.classList.add(hideClasses[i]);
    }
    placeControlBar(bar, force);
  }

  function startDomWork() {
    insertCopyButton();
    hideKnownAds();
    disablePopHandlers();
    keepLandscapeControls();
    injectAdCss();
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
