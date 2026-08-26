/*
  admin-app.js
  ------------
  The entire "invite-only" account system's admin side: lets an admin
  account (currently just Mei) create a login for someone else without
  any public signup form existing anywhere in the app. Not linked from
  anywhere in the normal nav — reached by typing the URL directly.
*/

function loadUserList() {
  fetch("/api/admin/users")
    .then((res) => res.json())
    .then(({ users }) => {
      const list = document.getElementById("admin-user-list");
      list.innerHTML = "";
      (users || []).forEach((u) => {
        const li = document.createElement("li");
        const created = new Date(u.created_at).toLocaleDateString();
        li.textContent = `${u.email}${u.is_admin ? " (admin)" : ""} — joined ${created}`;
        list.appendChild(li);
      });
    })
    .catch(() => {
      // Non-critical — the create-account form still works without this list.
    });
}

document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/me")
    .then((res) => {
      if (res.status === 401) {
        window.location.href = "login.html?return=" + encodeURIComponent(window.location.pathname);
        return null;
      }
      return res.json();
    })
    .then((body) => {
      if (!body) return;
      if (!body.user.isAdmin) {
        document.getElementById("admin-not-authorized").hidden = false;
        return;
      }
      document.getElementById("admin-panel").hidden = false;
      loadUserList();
    });

  const form = document.getElementById("admin-create-form");
  const errorEl = document.getElementById("admin-create-error");
  const successEl = document.getElementById("admin-create-success");
  const submitBtn = document.getElementById("admin-create-submit");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    successEl.hidden = true;
    submitBtn.disabled = true;

    const email = document.getElementById("admin-new-email").value.trim();
    const password = document.getElementById("admin-new-password").value;

    fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        submitBtn.disabled = false;
        if (!ok) {
          errorEl.textContent = body.error || "Could not create that account.";
          errorEl.hidden = false;
          return;
        }
        successEl.textContent = `Created an account for ${body.user.email}. Share the email + password with them directly.`;
        successEl.hidden = false;
        form.reset();
        loadUserList();
      })
      .catch(() => {
        submitBtn.disabled = false;
        errorEl.textContent = "Could not reach the server. Try again.";
        errorEl.hidden = false;
      });
  });
});
