const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

// Helper function to format message with proper image URLs
const formatMessage = (message) => {
    const formattedMessage = message.toObject();
    
    // Format sender's image URLs
    if (formattedMessage.sender) {
        formattedMessage.sender.profilePicture = formattedMessage.sender.profilePicture
            ? (formattedMessage.sender.profilePicture.startsWith('http')
                ? formattedMessage.sender.profilePicture
                : `http://localhost:5000/${formattedMessage.sender.profilePicture}`)
            : null;
        formattedMessage.sender.avatar = formattedMessage.sender.avatar
            ? (formattedMessage.sender.avatar.startsWith('http')
                ? formattedMessage.sender.avatar
                : `http://localhost:5000/${formattedMessage.sender.avatar}`)
            : null;
    }

    // Format recipient's image URLs
    if (formattedMessage.recipient) {
        formattedMessage.recipient.profilePicture = formattedMessage.recipient.profilePicture
            ? (formattedMessage.recipient.profilePicture.startsWith('http')
                ? formattedMessage.recipient.profilePicture
                : `http://localhost:5000/${formattedMessage.recipient.profilePicture}`)
            : null;
        formattedMessage.recipient.avatar = formattedMessage.recipient.avatar
            ? (formattedMessage.recipient.avatar.startsWith('http')
                ? formattedMessage.recipient.avatar
                : `http://localhost:5000/${formattedMessage.recipient.avatar}`)
            : null;
    }

    return formattedMessage;
};

// @route   GET api/messages
// @desc    Get all messages for current user
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.user._id },
                { recipient: req.user._id }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'username profilePicture avatar')
        .populate('recipient', 'username profilePicture avatar');

        const formattedMessages = messages.map(formatMessage);
        res.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET api/messages/:userId
// @desc    Get messages between current user and another user
// @access  Private
router.get('/:userId', auth, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.user._id, recipient: req.params.userId },
                { sender: req.params.userId, recipient: req.user._id }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'username profilePicture avatar')
        .populate('recipient', 'username profilePicture avatar');

        const formattedMessages = messages.map(formatMessage);
        res.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST api/messages/:userId
// @desc    Send a message to another user
// @access  Private
router.post(
    '/:userId',
    [
        auth,
        [check('text', 'Text is required').not().isEmpty()]
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const recipient = await User.findById(req.params.userId);
            if (!recipient) {
                return res.status(404).json({ message: 'User not found' });
            }

            const newMessage = new Message({
                sender: req.user._id,
                recipient: req.params.userId,
                text: req.body.text
            });

            await newMessage.save();

            // Populate sender and recipient details
            await newMessage.populate('sender', 'username profilePicture avatar');
            await newMessage.populate('recipient', 'username profilePicture avatar');

            const formattedMessage = formatMessage(newMessage);

            // Emit the new message through Socket.IO
            const io = req.app.get('io');
            if (io) {
                // Emit to recipient's room
                io.to(req.params.userId).emit('newMessage', formattedMessage);
                // Emit to sender's room for confirmation
                io.to(req.user._id).emit('messageSent', formattedMessage);
            }

            res.json(formattedMessage);
        } catch (error) {
            console.error('Error sending message:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// @route   PUT api/messages/:messageId
// @desc    Update a message
// @access  Private
router.put(
    '/:messageId',
    [
        auth,
        [check('text', 'Text is required').not().isEmpty()]
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const message = await Message.findById(req.params.messageId);
            if (!message) {
                return res.status(404).json({ message: 'Message not found' });
            }

            // Check if user is the sender
            if (message.sender.toString() !== req.user._id) {
                return res.status(403).json({ message: 'Not authorized to edit this message' });
            }

            message.text = req.body.text;
            message.updatedAt = Date.now();
            await message.save();

            // Populate sender and recipient details
            await message.populate('sender', 'username profilePicture avatar');
            await message.populate('recipient', 'username profilePicture avatar');

            const formattedMessage = formatMessage(message);

            // Emit the updated message through Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to(message.recipient.toString()).emit('messageUpdated', formattedMessage);
                io.to(message.sender.toString()).emit('messageUpdated', formattedMessage);
            }

            res.json(formattedMessage);
        } catch (error) {
            console.error('Error updating message:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// @route   DELETE api/messages/:messageId
// @desc    Delete a message
// @access  Private
router.delete('/:messageId', auth, async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Check if user is the sender
        if (message.sender.toString() !== req.user._id) {
            return res.status(403).json({ message: 'Not authorized to delete this message' });
        }

        await message.remove();

        // Emit the deleted message through Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to(message.recipient.toString()).emit('messageDeleted', {
                messageId: req.params.messageId
            });
            io.to(message.sender.toString()).emit('messageDeleted', {
                messageId: req.params.messageId
            });
        }

        res.json({ message: 'Message deleted' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;