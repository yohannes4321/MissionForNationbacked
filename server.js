const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invite');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

app.use('/auth', authRoutes);
app.use('/invite', inviteRoutes);
app.use('/api', adminRoutes);
app.use('/api', uploadRoutes);

// Backward-compatible alias for clients requesting galleries outside the /api prefix.
app.get('/galleries/all', (req, res) => {
	const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
	return res.redirect(`/api/galleries/all${query}`);
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Server running on port', port));
