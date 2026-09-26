const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const opts = {
    credentials: "include",
    ...options,
    headers: { ...((options && options.headers) || {}) },
  };

  if (opts.method && opts.method.toUpperCase() !== "GET") {
    const match = document.cookie.match(/(?:^|; )optimize_csrf=([^;]*)/);
    if (match) opts.headers["X-CSRF-Token"] = decodeURIComponent(match[1]);
  }

  const response = await fetch(url, opts);
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "string" ? body : body.error || "Request failed (" + response.status + ")";
    throw new Error(message);
  }

  return body;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function setAuthMessage(message, good = false) {
  $("authMessage").className = good ? "ok" : "warn";
  $("authMessage").textContent = message || "";
}

function setAppMessage(message) {
  $("appMessage").textContent = message || "";
}

function showAuth() {
  $("authPanel").hidden = false;
  $("appPanel").hidden = true;
}

function showApp(session) {
  $("authPanel").hidden = true;
  $("appPanel").hidden = false;
  $("identity").textContent = (session.user.displayName || session.user.email) + " · " + session.tenant.name;
  $("role").textContent = session.tenant.role;
}

function renderItems(target, items, empty = "No results yet.") {
  $(target).innerHTML = items.length
    ? items.slice(0, 10).map((item) =>
      '<div class="item"><strong>' +
      escapeHtml(item.title || item.name || "Signal") +
      '</strong><span>' +
      escapeHtml(item.source || item.category || "OPTIMIZE") +
      (item.score != null ? " · score " + item.score : "") +
      "</span></div>"
    ).join("")
    : '<div class="muted">' + empty + "</div>";
}

async function refreshStatus() {
  try {
    const data = await api("/api/jobber/status");
    if (data.connected) {
      $("status").innerHTML =
        '<span class="ok">● Connected</span><br>' +
        escapeHtml(data.account?.name || "Jobber account") +
        (data.status !== "connected" ? " · " + escapeHtml(data.status) : "");
      $("connectionPill").innerHTML = '<span class="ok">Jobber connected</span>';
    } else {
      $("status").innerHTML = '<span class="warn">● Not connected</span>';
      $("connectionPill").innerHTML = '<span class="warn">Jobber offline</span>';
    }
  } catch (error) {
    $("status").textContent = "Status unavailable: " + error.message;
    $("connectionPill").textContent = "API check failed";
  }
}

async function runRadar() {
  $("scan").disabled = true;
  $("radarList").innerHTML = '<div class="muted">Scanning live sources…</div>';
  try {
    const data = await api("/api/radar/open-data?all=1");
    const signals = data.signals || [];
    $("radarCount").textContent = signals.length;
    renderItems("radarList", signals);
    $("output").textContent = JSON.stringify({
      generatedAt: data.generatedAt,
      geography: data.geography,
      sources: data.sources
    }, null, 2);
  } catch (error) {
    $("radarList").innerHTML = '<div class="warn">' + escapeHtml(error.message) + "</div>";
    $("output").textContent = error.stack || error.message;
  } finally {
    $("scan").disabled = false;
  }
}

async function loadJobber() {
  $("sync").disabled = true;
  try {
    const data = await api("/api/jobber/opportunities");
    const items = data.opportunities || [];
    $("jobberCount").textContent = items.length;
    renderItems("jobberList", items, "No Jobber opportunities yet.");
    $("output").textContent = JSON.stringify({
      generatedAt: data.generatedAt,
      count: items.length
    }, null, 2);
  } catch (error) {
    $("jobberList").innerHTML = '<div class="muted">' + escapeHtml(error.message) + "</div>";
  } finally {
    $("sync").disabled = false;
  }
}

async function loadSession() {
  try {
    const session = await api("/api/auth/session");
    if (!session.authenticated) {
      showAuth();
      return null;
    }

    showApp(session);
    await refreshStatus();
    await Promise.allSettled([runRadar(), loadJobber()]);
    return session;
  } catch (error) {
    showAuth();
    setAuthMessage(error.message);
    return null;
  }
}

async function login() {
  setAuthMessage("");
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  try {
    const session = await api("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    showApp(session);
    setAuthMessage("");
    await refreshStatus();
    await Promise.allSettled([runRadar(), loadJobber()]);
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function register() {
  setAuthMessage("");
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const displayName = $("registerName").value.trim();
  const tenantName = $("registerTenant").value.trim();

  try {
    const session = await api("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, displayName, tenantName })
    });
    showApp(session);
    setAuthMessage("");
    await refreshStatus();
    await Promise.allSettled([runRadar(), loadJobber()]);
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    showAuth();
    setAuthMessage("");
  }
}

$("loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  login();
});

$("registerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  register();
});

$("logout").addEventListener("click", logout);
$("scan").addEventListener("click", runRadar);
$("sync").addEventListener("click", loadJobber);

$("connect").addEventListener("click", () => {
  window.location.href = "/api/jobber/auth";
});

$("disconnect").addEventListener("click", async () => {
  $("disconnect").disabled = true;
  try {
    await api("/api/jobber/disconnect", { method: "POST" });
    await refreshStatus();
    await loadJobber();
  } catch (error) {
    setAppMessage(error.message);
  } finally {
    $("disconnect").disabled = false;
  }
});

$("showLogin").addEventListener("click", () => {
  $("loginBox").hidden = false;
  $("registerBox").hidden = true;
  $("showLogin").classList.add("active");
  $("showRegister").classList.remove("active");
});

$("showRegister").addEventListener("click", () => {
  $("loginBox").hidden = true;
  $("registerBox").hidden = false;
  $("showLogin").classList.remove("active");
  $("showRegister").classList.add("active");
});

window.addEventListener("load", async () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("jobber") === "connected") {
    setAppMessage("Jobber connected.");
    history.replaceState({}, document.title, "/");
  }

  await loadSession();
});
