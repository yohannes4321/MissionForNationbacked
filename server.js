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
app.use(cors());
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
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(port, () => console.log('Server running on port', port));
