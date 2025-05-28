const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Post = require('../models/Post');

// Get all saved posts for a user
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('savedPosts');
        res.json(user.savedPosts);
    } catch (err) {
        console.error('Error fetching saved posts:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Save a post
router.post('/:postId', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const user = await User.findById(req.user._id);
        if (user.savedPosts.includes(req.params.postId)) {
            return res.status(400).json({ message: 'Post already saved' });
        }

        user.savedPosts.push(req.params.postId);
        await user.save();

        res.json({ message: 'Post saved successfully' });
    } catch (err) {
        console.error('Error saving post:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Remove a saved post
router.delete('/:postId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.savedPosts = user.savedPosts.filter(
            postId => postId.toString() !== req.params.postId
        );
        await user.save();

        res.json({ message: 'Post removed from saved' });
    } catch (err) {
        console.error('Error removing saved post:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Basic test route
router.get('/test', (req, res) => {
    res.json({ message: 'Saved routes working' });
});

// Protected test route
router.get('/protected', auth, (req, res) => {
    res.json({ message: 'Protected saved route working', user: req.user });
});

module.exports = router; 