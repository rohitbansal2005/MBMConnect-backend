const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const UserSettings = require('../models/UserSettings');

// Get user settings
router.get('/', auth, async (req, res) => {
    try {
        let settings = await UserSettings.findOne({ user: req.user._id });
        
        if (!settings) {
            return res.json({
                showOnlineStatus: true,
                showLastSeen: true,
                theme: 'light'
            });
        }

        res.json({
            showOnlineStatus: settings.showOnlineStatus,
            showLastSeen: settings.showLastSeen,
            theme: settings.theme || 'light'
        });
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user settings
router.put('/', auth, async (req, res) => {
    try {
        const { showOnlineStatus, showLastSeen, theme } = req.body;
        const updates = {};

        if (typeof showOnlineStatus === 'boolean') {
            updates.showOnlineStatus = showOnlineStatus;
        }
        if (typeof showLastSeen === 'boolean') {
            updates.showLastSeen = showLastSeen;
        }
        if (theme) {
            updates.theme = theme;
        }

        const settings = await UserSettings.findOneAndUpdate(
            { user: req.user._id },
            { $set: updates },
            { new: true, upsert: true }
        );

        res.json({
            showOnlineStatus: settings.showOnlineStatus,
            showLastSeen: settings.showLastSeen,
            theme: settings.theme
        });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;