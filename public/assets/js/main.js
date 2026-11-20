// Site behaviour. No inline scripts anywhere — required by the Content-Security-Policy in _headers.
// Every feature is optional: the site is fully usable without JavaScript, and each feature is set up
// independently, so a failure in one never breaks the others.
(function () {
  "use strict";
  var root = document.documentElement;

  // Hosts allowed in the prototype viewer. Keep in sync with frame-src in _headers (currently 'none':
  // add hosts there too when you publish an embeddable prototype).
  var DEMO_HOST_SUFFIXES = [".vercel.app", ".streamlit.app", ".lovable.app", ".replit.app", ".pages.dev"];
  var EMBED_TIMEOUT_MS = 15000;

  function safely(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.warn("[site] " + name + " disabled:", e); }
  }

  /* ---------- Theme toggle ---------- */
  safely("theme", function () {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var current = root.getAttribute("data-theme") || (dark ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode: theme still applies this visit */ }
    });
  });

  /* ---------- Mobile menu ---------- */
  safely("menu", function () {
    var btn = document.querySelector("[data-menu-toggle]");
    var links = document.querySelector(".nav-links");
    if (!btn || !links) return;
    function set(open) {
      links.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    btn.addEventListener("click", function () { set(!links.classList.contains("open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  });

  /* ---------- Footer year ---------- */
  safely("year", function () {
    document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  });

  /* ---------- Photos: if one fails to load, show initials instead of a broken image ---------- */
  safely("avatar", function () {
    document.querySelectorAll(".brand-mark img").forEach(function (img) {
      function fail() { img.hidden = true; }
      img.addEventListener("error", fail);
      if (img.complete && img.naturalWidth === 0) fail();
    });
  });
  safely("photos", function () {
    document.querySelectorAll("figure[data-initials] img").forEach(function (img) {
      function fail() { img.closest("figure").classList.add("no-photo"); img.hidden = true; }
      img.addEventListener("error", fail);
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) fail();
    });
  });

  /* ---------- Work filters ---------- */
  safely("filters", function () {
    var filters = document.querySelectorAll("[data-filter]");
    if (!filters.length) return;
    var status = document.querySelector("[data-filter-status]");
    var cards = document.querySelectorAll("[data-kind]");
    function apply(f) {
      var shown = 0;
      filters.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-filter") === f)); });
      cards.forEach(function (card) {
        var on = f === "all" || card.getAttribute("data-kind") === f;
        card.hidden = !on;
        if (on) shown++;
      });
      document.querySelectorAll("[data-group]").forEach(function (h) {
        var section = h.closest("section");
        if (section) section.hidden = !(f === "all" || h.getAttribute("data-group") === f);
      });
      if (status) {
        status.textContent = f === "all" ? "Showing all " + shown : "Showing " + shown + " of " + cards.length;
      }
    }
    filters.forEach(function (btn) {
      btn.addEventListener("click", function () { apply(btn.getAttribute("data-filter")); });
    });
  });

  /* ---------- Demo videos: show a fallback if the video can't play ---------- */
  safely("video", function () {
    document.querySelectorAll("video").forEach(function (v) {
      var src = v.querySelector("source");
      function fail() {
        if (v.dataset.failed) return;
        v.dataset.failed = "1";
        var note = document.createElement("p");
        note.className = "demo-fallback";
        note.textContent = "This video couldn't load in your browser. ";
        var a = document.createElement("a");
        a.href = (src && src.getAttribute("src")) || v.currentSrc || "#";
        a.textContent = "Download it instead";
        note.appendChild(a);
        v.replaceWith(note);
      }
      v.addEventListener("error", fail);
      if (src) src.addEventListener("error", fail);
      if (v.error) fail();
    });
  });

  /* ---------- Prototype viewer (sandboxed iframe, allow-listed hosts only; used when a page has one) ---------- */
  function allowedDemoUrl(raw) {
    var url;
    try { url = new URL(raw, location.href); } catch (e) { return null; }
    if (url.protocol !== "https:") return null;
    var host = url.hostname.toLowerCase();
    var ok = DEMO_HOST_SUFFIXES.some(function (s) { return host.length > s.length && host.slice(-s.length) === s; });
    return ok ? url : null;
  }

  safely("demo-modal", function () {
    var buttons = document.querySelectorAll("[data-demo-url]");
    if (!buttons.length) return;
    var modal = document.querySelector("dialog.demo-modal");
    if (!modal || typeof modal.showModal !== "function") {
      buttons.forEach(function (btn) {
        var url = allowedDemoUrl(btn.getAttribute("data-demo-url"));
        if (!url) { btn.disabled = true; return; }
        btn.addEventListener("click", function () { window.open(url.href, "_blank", "noopener,noreferrer"); });
      });
      return;
    }
    var frame = modal.querySelector("iframe");
    var title = modal.querySelector("[data-modal-title]");
    var newTab = modal.querySelector("[data-modal-newtab]");
    var status = modal.querySelector("[data-modal-status]");
    var timer = null;
    buttons.forEach(function (btn) {
      var url = allowedDemoUrl(btn.getAttribute("data-demo-url"));
      if (!url) { btn.disabled = true; btn.title = "Demo link not allowed"; return; }
      btn.addEventListener("click", function () {
        title.textContent = btn.getAttribute("data-demo-title") || "Prototype demo";
        newTab.href = url.href;
        if (status) { status.hidden = false; status.textContent = "Loading the prototype…"; }
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (status) status.textContent = "This prototype is slow to load or may be asleep. Try “Open in new tab”.";
        }, EMBED_TIMEOUT_MS);
        frame.onload = function () {
          if (frame.src === "about:blank") return;
          clearTimeout(timer);
          if (status) status.hidden = true;
        };
        frame.src = url.href;
        modal.showModal();
      });
    });
    modal.querySelector("[data-modal-close]").addEventListener("click", function () { modal.close(); });
    modal.addEventListener("close", function () { clearTimeout(timer); frame.src = "about:blank"; });
  });
})();
