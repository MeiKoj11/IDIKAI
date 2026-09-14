/*
  howto.js
  --------
  Generic "How to use" help-modal controller, shared by any page that has
  a button like:

    <button type="button" class="howto-btn" data-howto-trigger="OVERLAY_ID">
      How to use
    </button>

  paired with a matching overlay elsewhere on the page:

    <div class="howto-overlay" id="OVERLAY_ID" role="dialog" aria-modal="true" hidden>
      <div class="howto-modal"> ... </div>
    </div>

  No page navigation happens — this just toggles the `hidden` attribute on
  the overlay. Closes on: the × button (data-howto-close), clicking the
  dimmed backdrop itself, or Escape.
*/

(function () {
  function openOverlay(overlay) {
    overlay.hidden = false;
    document.body.classList.add("howto-open");
    var closeBtn = overlay.querySelector(".howto-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeOverlay(overlay) {
    overlay.hidden = true;
    document.body.classList.remove("howto-open");
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-howto-trigger]");
    if (trigger) {
      var overlay = document.getElementById(trigger.getAttribute("data-howto-trigger"));
      if (overlay) openOverlay(overlay);
      return;
    }

    var closeEl = e.target.closest("[data-howto-close]");
    if (closeEl) {
      var ov = closeEl.closest(".howto-overlay");
      if (ov) closeOverlay(ov);
      return;
    }

    // Clicking the dimmed backdrop (not the modal box itself) closes it too.
    if (e.target.classList && e.target.classList.contains("howto-overlay")) {
      closeOverlay(e.target);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".howto-overlay").forEach(function (ov) {
      if (!ov.hidden) closeOverlay(ov);
    });
  });
})();
