const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');

router.post('/',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    // Create user
  }
);

router.get('/:id', auth, async (req, res) => {
  // Get user
});

router.put('/:id', auth, async (req, res) => {
  // Update user
});

router.delete('/:id', auth, async (req, res) => {
  // Delete user
});

module.exports = router;
