const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

// handle unhandled promise rejections and uncaught exceptions to avoid crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const app = express();
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

app.use(
	cors({
		origin: (origin, callback) => {
			// Allow server-to-server, curl, and health checks with no Origin header.
			if (!origin) return callback(null, true);
			if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
				return callback(null, true);
			}
			return callback(new Error(`CORS blocked for origin: ${origin}`));
		}
	})
);
app.use(bodyParser.json());

const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invite');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/invite', inviteRoutes);
app.use('/api', adminRoutes);
app.use('/api', uploadRoutes);

app.get('/health', (req, res) => {
	return res.json({ ok: true });
});

// Backward-compatible alias for clients requesting galleries outside the /api prefix.
app.get('/galleries/all', (req, res) => {
	const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
	return res.redirect(`/api/galleries/all${query}`);
});

const port = process.env.PORT || 4000;
// catch-all for unknown routes (prevent crashes when client hits wrong URL)
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// global error handler
app.use((err, req, res, next) => {
	const isDbConnectivityError =
		err &&
		(err.code === 'ETIMEDOUT' ||
			err.code === 'ENETUNREACH' ||
			err.code === 'ECONNREFUSED' ||
			err.code === 'EHOSTUNREACH');

	if (isDbConnectivityError) {
		console.error('Database connectivity error:', err.message);
		return res.status(503).json({
			error: 'Database temporarily unavailable. Please try again shortly.'
		});
	}

	console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);

	const status = err.status || 500;
	const payload = { error: status === 500 ? 'Server error' : err.message || 'Request failed' };
	if (process.env.NODE_ENV !== 'production' && err && err.message) {
		payload.debug = err.message;
	}

	res.status(status).json(payload);
});

app.listen(port, () => console.log('Server running on port', port));
