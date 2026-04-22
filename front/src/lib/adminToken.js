const KEY = "termooo-libras.adminToken";

export function getAdminToken() {
  return sessionStorage.getItem(KEY) ?? "";
}

export function setAdminToken(token) {
  if (token) sessionStorage.setItem(KEY, token);
  else sessionStorage.removeItem(KEY);
}
