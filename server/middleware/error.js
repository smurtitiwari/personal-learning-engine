export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[error] ${status} — ${message}`);
    if (err.stack) console.error(err.stack);
  }

  res.status(status).json({
    error: true,
    message,
    ...(process.env.NODE_ENV !== 'production' && err.detail ? { detail: err.detail } : {}),
  });
}

export function notFound(_req, res) {
  res.status(404).json({ error: true, message: 'Not found' });
}

export function createError(status, message, detail) {
  const err = new Error(message);
  err.status = status;
  if (detail) err.detail = detail;
  return err;
}
