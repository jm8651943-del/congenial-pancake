(function (global) {
  function client(baseUrl) {
    const base = (baseUrl || global.OPTIMIZE_API_BASE || global.location.origin).replace(/\/$/, "");

    function csrfToken() {
      const match = document.cookie.match(/(?:^|; )optimize_csrf=([^;]*)/);
      return match ? decodeURIComponent(match[1]) : "";
    }

    async function request(path, options) {
      const opts = {
        credentials: "include",
        ...(options || {}),
        headers: { ...((options && options.headers) || {}) },
      };

      if (opts.method && opts.method.toUpperCase() !== "GET") {
        opts.headers["X-CSRF-Token"] = csrfToken();
      }

      const response = await fetch(base + path, opts);
      const type = response.headers.get("content-type") || "";
      const body = type.includes("application/json") ? await response.json() : await response.text();

      if (!response.ok) {
        const message = typeof body === "string"
          ? body
          : body.error || "OPTIMIZE request failed (" + response.status + ")";
        throw new Error(message);
      }

      return body;
    }

    return {
      authSession() { return request("/api/auth/session"); },
      login(email, password) {
        return request("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      },
      register(email, password, tenantName, displayName) {
        return request("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, tenantName, displayName }),
        });
      },
      logout() { return request("/api/auth/logout", { method: "POST" }); },
      connect() { global.location.href = base + "/api/jobber/auth"; },
      status() { return request("/api/jobber/status"); },
      snapshot() { return request("/api/jobber/data?type=snapshot"); },
      clients() { return request("/api/jobber/data?type=clients"); },
      jobs() { return request("/api/jobber/data?type=jobs"); },
      opportunities() { return request("/api/jobber/opportunities"); },
      sync(resource = "all") { return request("/api/jobber/sync?resource=" + encodeURIComponent(resource)); },
      disconnect() { return request("/api/jobber/disconnect", { method: "POST" }); },
    };
  }

  global.OPTIMIZE_JOBBER = client;
})(window);
