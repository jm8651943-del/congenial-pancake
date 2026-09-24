(function (global) {
  function client(baseUrl) {
    const base = (baseUrl || global.OPTIMIZE_API_BASE || global.location.origin).replace(/\/$/, "");

    async function request(path, options) {
      const response = await fetch(base + path, {
        credentials: "include",
        ...options,
        headers: { ...(options && options.headers ? options.headers : {}) },
      });
      const type = response.headers.get("content-type") || "";
      const body = type.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        const message = typeof body === "string" ? body : body.error || `OPTIMIZE request failed (${response.status})`;
        throw new Error(message);
      }
      return body;
    }

    return {
      base,
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
