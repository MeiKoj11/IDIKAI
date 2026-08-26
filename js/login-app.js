/*
  login-app.js
  ------------
  Plain email/password login. On success, redirects to whatever page
  the user was originally trying to reach (storage.js sends people
  here with a ?return= param when their session has expired or never
  existed), falling back to the language picker.

  Only ever redirects to a same-site relative path — never follows
  ?return= to an absolute/external URL, so this can't be turned into
  an open-redirect trick via a crafted link.
*/

function safeReturnPath() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("return");
  if (!raw) return "index.html";
  // Must start with a single "/" (a relative same-site path) — reject
  // anything that looks like "//evil.com" or "https://evil.com".
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(1) || "index.html";
  return "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in…";

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) {
          errorEl.textContent = body.error || "Could not log in.";
          errorEl.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = "Log in";
          return;
        }
        window.location.href = safeReturnPath();
      })
      .catch(() => {
        errorEl.textContent = "Could not reach the server. Check your connection and try again.";
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Log in";
      });
  });
});
