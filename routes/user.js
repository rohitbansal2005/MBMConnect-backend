const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

module.exports = router; 