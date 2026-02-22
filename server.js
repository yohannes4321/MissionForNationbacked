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

app.use('/auth', authRoutes);
app.use('/invite', inviteRoutes);
app.use('/api', adminRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Server running on port', port));
