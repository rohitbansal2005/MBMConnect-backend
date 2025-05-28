const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Basic admin routes
router.get('/test', [auth, admin], (req, res) => {
    res.json({ message: 'Admin routes working' });
});

module.exports = router; 