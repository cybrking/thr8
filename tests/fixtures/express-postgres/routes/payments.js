const router = require('express').Router();
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const paymentLimiter = rateLimit({ windowMs: 60000, max: 10 });

router.post('/', auth, paymentLimiter, async (req, res) => {
  // Process payment via Stripe
});

router.get('/:id', auth, async (req, res) => {
  // Get payment
});

module.exports = router;
