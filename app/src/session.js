async function sessionRequest(options = {}) {
  const response = await fetch("/api/session", {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo validar la sesión.");
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

export async function getFaroSession() {
  try {
    return await sessionRequest();
  } catch (error) {
    if (error.status === 401 || error.status === 404) return { authenticated: false, user: null };
    throw error;
  }
}

export function loginFaro(token) {
  return sessionRequest({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function logoutFaro() {
  return sessionRequest({ method: "DELETE" });
}
