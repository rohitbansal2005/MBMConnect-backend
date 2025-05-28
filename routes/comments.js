const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { io } = require('../server'); // ya jahan aapka io export hua hai

// Comment schema with timestamps
const commentSchema = new mongoose.Schema({
  content: String,
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);

// GET /api/comments - Fetch all comments
router.get('/', async (req, res) => {
  try {
    const comments = await Comment.find().sort({ createdAt: -1 }); // Sort by newest first
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/posts/:id/comment - Add a new comment to a post
router.post('/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  try {
    // Make sure you have Post model imported if you want to check post existence
    // const Post = require('../models/Post');
    // const post = await Post.findById(id);
    // if (!post) {
    //   return res.status(404).json({ error: 'Post not found' });
    // }

    // For now, skip post existence check if you don't have Post model
    const comment = new Comment({
      content,
      post: id,
      author: req.user?._id // Make sure req.user is set by auth middleware
    });

    await comment.save();

    // Emit the new comment to all connected clients
    io.emit('receiveComment', { postId: id, comment: comment });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;