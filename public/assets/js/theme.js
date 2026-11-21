// Loaded in <head> (not deferred) so the theme applies before first paint — no flash of the wrong theme.
// Themes: "dark" (default), "light", or "system" (follow the device setting). The stylesheet treats a
// missing attribute as dark too, so visitors without JavaScript also get the default.
(function () {
  var t = "dark";
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "system") t = saved;
  } catch (e) { /* storage blocked (private mode): keep the default */ }
  document.documentElement.setAttribute("data-theme", t);
})();
