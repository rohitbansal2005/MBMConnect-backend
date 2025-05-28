const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Get all notifications for the current user
router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const notifications = await Notification.find({ recipient: userId })
            .populate('sender', 'username profilePicture')
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
});

// Mark notification as read
router.put('/:notificationId/read', auth, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.notificationId, recipient: userId },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json(notification);
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error marking notification as read', error: error.message });
    }
});

// Mark all notifications as read
router.put('/read-all', auth, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        await Notification.updateMany(
            { recipient: userId, read: false },
            { read: true }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Error marking all notifications as read', error: error.message });
    }
});

// Delete a notification
router.delete('/:notificationId', auth, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const notification = await Notification.findOneAndDelete({
            _id: req.params.notificationId,
            recipient: userId
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ message: 'Error deleting notification', error: error.message });
    }
});

// Get unread notification count
router.get('/unread/count', auth, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const count = await Notification.countDocuments({
            recipient: userId,
            read: false
        });

        res.json({ count });
    } catch (error) {
        console.error('Error getting unread notification count:', error);
        res.status(500).json({ message: 'Error getting unread notification count', error: error.message });
    }
});

module.exports = router;
