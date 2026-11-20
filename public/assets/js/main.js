// Site behaviour. No inline scripts anywhere — required by the Content-Security-Policy in _headers.
// Each feature is set up independently, so a failure in one never breaks the others.
(function () {
  "use strict";
  var root = document.documentElement;

  // Only these hosts may be embedded or opened from the Demos page. Keep in sync with frame-src in _headers.
  var DEMO_HOST_SUFFIXES = [".vercel.app", ".streamlit.app", ".lovable.app", ".replit.app", ".pages.dev"];
  var DEMO_TIMEOUT_MS = 30000;   // live AI demo request
  var EMBED_TIMEOUT_MS = 15000;  // embedded prototype first load

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
    }
    btn.addEventListener("click", function () { set(!links.classList.contains("open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  });

  /* ---------- Footer year ---------- */
  safely("year", function () {
    document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  });

  /* ---------- Work filters ---------- */
  safely("filters", function () {
    var filters = document.querySelectorAll("[data-filter]");
    filters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var f = btn.getAttribute("data-filter");
        filters.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        document.querySelectorAll("[data-kind]").forEach(function (card) {
          card.hidden = !(f === "all" || card.getAttribute("data-kind") === f);
        });
      });
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

  /* ---------- Prototype demo modal (sandboxed iframe, allow-listed hosts only) ---------- */
  function allowedDemoUrl(raw) {
    var url;
    try { url = new URL(raw, location.href); } catch (e) { return null; }
    if (url.protocol !== "https:") return null;
    var host = url.hostname.toLowerCase();
    var ok = DEMO_HOST_SUFFIXES.some(function (s) { return host.length > s.length && host.slice(-s.length) === s; });
    return ok ? url : null;
  }

  safely("demo-modal", function () {
    var modal = document.querySelector("dialog.demo-modal");
    if (!modal || typeof modal.showModal !== "function") {
      // Very old browsers without <dialog>: fall back to opening allowed demos in a new tab.
      document.querySelectorAll("[data-demo-url]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var url = allowedDemoUrl(btn.getAttribute("data-demo-url"));
          if (url) window.open(url.href, "_blank", "noopener,noreferrer");
        });
      });
      return;
    }
    var frame = modal.querySelector("iframe");
    var title = modal.querySelector("[data-modal-title]");
    var newTab = modal.querySelector("[data-modal-newtab]");
    var status = modal.querySelector("[data-modal-status]");
    var timer = null;

    document.querySelectorAll("[data-demo-url]").forEach(function (btn) {
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

  /* ---------- Live AI demo (calls /api/demo, rate-limited server-side) ---------- */
  safely("ai-demo", function () {
    var form = document.querySelector("[data-ai-demo]");
    if (!form) return;
    var input = form.querySelector("textarea");
    var out = form.querySelector(".demo-output");
    var quota = form.querySelector(".demo-quota");
    var submit = form.querySelector("button[type=submit]");
    var MAX = parseInt(input.getAttribute("maxlength"), 10) || 400;
    var busy = false;

    form.querySelectorAll("[data-example]").forEach(function (b) {
      b.addEventListener("click", function () { input.value = b.getAttribute("data-example"); input.focus(); });
    });

    function show(msg, isErr) {
      out.textContent = msg; // textContent, never innerHTML — model output is untrusted
      out.classList.toggle("error", !!isErr);
    }

    function messageForStatus(status) {
      if (status === 429) return "You've reached today's free limit. Please come back tomorrow.";
      if (status === 403) return "This demo only works on the portfolio site itself.";
      if (status === 404 || status === 405 || status === 503) return "The live demo isn't switched on right now. Please try again later.";
      if (status === 504) return "The AI took too long to answer. Please try again.";
      return "Something went wrong on our side. Please try again in a minute.";
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;
      var text = input.value.trim();
      if (!text) { show("Please enter a transaction first.", true); return; }
      if (text.length > MAX) { show("Please keep it under " + MAX + " characters.", true); return; }
      if (navigator.onLine === false) { show("You appear to be offline. Check your connection and try again.", true); return; }

      busy = true;
      submit.disabled = true;
      show("Thinking…", false);

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, DEMO_TIMEOUT_MS);

      fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text }),
        signal: controller ? controller.signal : undefined,
        credentials: "same-origin",
        redirect: "error" // never follow a redirect to another site
      })
        .then(function (r) {
          return r.json().then(
            function (d) { return { status: r.status, ok: r.ok, data: d || {} }; },
            function () { return { status: r.status, ok: false, data: {} }; } // non-JSON (e.g. host error page)
          );
        })
        .then(function (res) {
          if (typeof res.data.remaining === "number") {
            quota.textContent = res.data.remaining + (res.data.remaining === 1 ? " free run" : " free runs") + " left today";
          }
          if (res.ok && typeof res.data.output === "string" && res.data.output) {
            show(res.data.output, false);
          } else {
            show(typeof res.data.error === "string" && res.data.error ? res.data.error : messageForStatus(res.status), true);
          }
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") show("The AI took too long to answer. Please try again.", true);
          else show("Couldn't reach the demo. Check your connection and try again.", true);
        })
        .then(function () {
          clearTimeout(timer);
          busy = false;
          submit.disabled = false;
        });
    });
  });
})();
