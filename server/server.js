require('./db');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const entriesRouter = require('./routes/entries');
const authRouter = require('./routes/auth');
const departmentsRouter = require('./routes/departments');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : '*'
}));

app.use(express.json({ limit: '1mb' }));

const passcodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' }
});

app.get('/api/v1/health', (req, res) => {
  res.json({ ok: true, version: require('./package.json').version });
});

app.use('/api/v1/departments', departmentsRouter);
app.use('/api/v1/auth', passcodeLimiter, authRouter);
app.use('/api/v1/entries', (req, res, next) => {
  if (req.method === 'GET') return next();
  return passcodeLimiter(req, res, next);
}, entriesRouter);

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`CMS Engine library server listening on port ${PORT}`);
});
