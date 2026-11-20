// Loaded in <head> (not deferred) so the saved theme applies before first paint.
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* storage blocked: fall back to system preference */ }
})();
