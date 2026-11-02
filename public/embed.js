/*
 * CR8OR Forms embed script.
 *
 * <script src="https://YOUR-HOST/embed.js" data-cr8or-form="lead-gen-starter" async></script>
 *
 * Optional attributes:
 *   data-container="#selector"   put the form inside this element (default: right after the script tag)
 *   data-min-height="480"        height shown before the form reports its own
 *
 * - Passes the host page's URL params (utm_*, fbclid, gclid, ...) and ?cr8or_sid to the form
 * - Resizes the iframe to fit the form (no inner scrollbar)
 * - Re-dispatches form events on the host page as window "cr8or-form" CustomEvents
 * - Performs redirect-on-complete in the top window
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-cr8or-form");
  if (!slug) return;

  var origin = new URL(script.src, location.href).origin;
  var src = new URL("/f/" + encodeURIComponent(slug), origin);

  // Forward tracking params from the host page. A returning visitor's saved submission id is honoured.
  var host = new URLSearchParams(location.search);
  host.forEach(function (value, key) {
    if (key === "cr8or_sid") src.searchParams.set("sid", value);
    else if (key !== "sid" && key !== "q") src.searchParams.set(key, value);
  });
  if (host.get("cr8or_q")) src.searchParams.set("q", host.get("cr8or_q"));

  var frame = document.createElement("iframe");
  frame.src = src.toString();
  frame.title = "Form";
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("allow", "clipboard-write");
  frame.style.cssText = "width:100%;border:0;display:block;overflow:hidden;color-scheme:normal;";
  frame.style.height = (script.getAttribute("data-min-height") || "480") + "px";

  var containerSel = script.getAttribute("data-container");
  var container = containerSel ? document.querySelector(containerSel) : null;
  if (container) container.appendChild(frame);
  else script.parentNode.insertBefore(frame, script.nextSibling);

  window.addEventListener("message", function (event) {
    // Only trust messages from our own iframe.
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    var data = event.data;
    if (!data || data.source !== "cr8or-form") return;

    if (data.type === "form:resize" && typeof data.height === "number") {
      frame.style.height = Math.max(200, Math.ceil(data.height)) + "px";
      return;
    }
    if (data.type === "form:redirect" && typeof data.url === "string" && /^https?:\/\//i.test(data.url)) {
      window.top.location.href = data.url;
      return;
    }
    window.dispatchEvent(new CustomEvent("cr8or-form", { detail: data }));
  });
})();
