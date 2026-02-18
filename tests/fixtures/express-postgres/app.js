const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
