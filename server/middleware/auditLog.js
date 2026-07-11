export function auditLog(req, res, next) {
  const entry = {
    time: new Date().toISOString(),
    userId: req.user?.id ?? 'unknown',
    role: req.user?.role ?? 'unknown',
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  };
  console.log('[ADMIN_AUDIT]', JSON.stringify(entry));
  next();
}
