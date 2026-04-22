// Returns true when the request carries a valid admin token header.
// When ADMIN_TOKEN is unset on the server, admin endpoints are disabled.
export function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const provided = req.headers["x-admin-token"];
  if (typeof provided !== "string" || provided.length !== expected.length) {
    return false;
  }
  // Constant-time compare to avoid timing leaks.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}
