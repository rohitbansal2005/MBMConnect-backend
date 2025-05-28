const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Post = require('../models/Post');
const auth = require('../middleware/auth');
const User = require('../models/User');
const sharp = require('sharp');
const fs = require('fs');
const Report = require('../models/Report');

// In-memory array for demo (use DB in production)
const postReports = [];

// Multer setup for images and videos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads', 'posts'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith('image/') ||
    file.mimetype.startsWith('video/')
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'), false);
  }
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// Get all posts
router.get('/', async (req, res) => {
    try {
        console.log('Fetching all posts...');
        const posts = await Post.find()
            .populate('author', 'username profilePicture')
            .populate({
                path: 'comments.author',
                select: 'username profilePicture'
            })
            .sort({ createdAt: -1 });
        
        console.log(`Found ${posts.length} posts`);
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ 
            message: error.message,
            error: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
});

// Create a post
router.post('/', auth, upload.single('media'), async (req, res) => {
  try {
    console.log('Creating post with data:', {
      content: req.body.content,
      hasMedia: !!req.file,
      userId: req.user._id,
      body: req.body,
      file: req.file
    });

    if (!req.body.content && !req.file) {
      return res.status(400).json({ message: 'Post must have either content or media' });
    }

    let media = '';
    let mediaType = '';

    if (req.file) {
      // Convert image to webp if it's an image
      if (req.file.mimetype.startsWith('image/')) {
        const inputPath = req.file.path;
        const outputPath = inputPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
        await sharp(inputPath)
          .webp()
          .toFile(outputPath);
        fs.unlinkSync(inputPath); // Remove original file
        media = 'uploads/posts/' + path.basename(outputPath);
        mediaType = 'image';
      } else {
        // For videos, just save as is
        media = 'uploads/posts/' + req.file.filename;
        mediaType = 'video';
      }
    }

    const post = new Post({
      author: req.user._id,
      content: req.body.content || '',
      media,
      mediaType
    });

    console.log('Attempting to save post:', post);

    const savedPost = await post.save();
    console.log('Post saved successfully:', savedPost);
    
    // Populate author information
    await savedPost.populate('author', 'username profilePicture');
    console.log('Post populated with author info:', savedPost);
    
    // Emit Socket.IO event for new post
    const io = req.app.get('io');
    if (io) {
        console.log('Emitting newPost event');
        io.emit('newPost', savedPost);
    }

    res.status(201).json(savedPost);
  } catch (err) {
    console.error('Error creating post:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    res.status(500).json({ 
      message: 'Error creating post',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
    });
  }
});

// Like/Unlike a post
router.put('/:id/like', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        const likeIndex = post.likes.indexOf(req.user._id);
        if (likeIndex === -1) {
            post.likes.push(req.user._id);
        } else {
            post.likes.splice(likeIndex, 1);
        }

        const updatedPost = await post.save();
        await updatedPost.populate('author', 'username profilePicture');
        res.json(updatedPost);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add a comment
router.post('/:id/comment', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        post.comments.push({
            text: req.body.text,
            author: req.user._id,
            createdAt: new Date()
        });

        const updatedPost = await post.save();
        // Populate author for the new comment
        await updatedPost.populate('comments.author', 'username profilePicture');
        res.json(updatedPost);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete a post
router.delete('/:id', auth, async (req, res) => {
    try {
        console.log('=== Delete Post Request ===');
        console.log('Post ID:', req.params.id);
        console.log('User from auth:', req.user);
        console.log('Auth token:', req.headers.authorization);

        if (!req.user || !req.user._id) {
            console.log('No user found in request');
            return res.status(401).json({ message: 'Authentication required' });
        }

        const post = await Post.findById(req.params.id);
        console.log('Found post:', {
            id: post?._id,
            author: post?.author,
            content: post?.content?.substring(0, 50) + '...'
        });

        if (!post) {
            console.log('Post not found');
            return res.status(404).json({ message: 'Post not found' });
        }

        // Only allow the author to delete
        if (post.author.toString() !== req.user._id) {
            console.log('Authorization failed:', {
                postAuthor: post.author.toString(),
                userId: req.user._id
            });
            return res.status(403).json({ message: 'Not authorized to delete this post' });
        }

        console.log('Attempting to delete post...');
        const deletedPost = await Post.findByIdAndDelete(req.params.id);
        console.log('Delete result:', deletedPost);

        if (!deletedPost) {
            console.log('Post deletion failed - no post returned');
            return res.status(404).json({ message: 'Post not found or already deleted' });
        }

        console.log('Post deleted successfully');
        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        console.error('Error in delete post route:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ 
            message: 'Error deleting post',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Edit/Update a post
router.put('/:id', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        if (post.author.toString() !== req.user._id) {
            return res.status(403).json({ message: 'Not authorized to edit this post' });
        }
        if (req.body.content !== undefined) post.content = req.body.content;
        if (req.body.media !== undefined) post.media = req.body.media;
        if (req.body.mediaType !== undefined) post.mediaType = req.body.mediaType;
        post.edited = true;
        post.editedAt = new Date();
        const updatedPost = await post.save();
        await updatedPost.populate('author', 'username profilePicture');
        res.json(updatedPost);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete a comment
router.delete('/:postId/comment/:commentId', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    // Only author of comment or post can delete
    if (
      comment.author.toString() !== req.user._id &&
      post.author.toString() !== req.user._id
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    // Remove comment (fix for Mongoose 6+)
    post.comments = post.comments.filter(
      c => c._id.toString() !== req.params.commentId
    );
    await post.save();
    await post.populate('comments.author', 'username profilePicture');
    res.json(post);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Edit a comment
router.put('/:postId/comment/:commentId', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (comment.author.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Not authorized to edit this comment' });
    }
    comment.text = req.body.text;
    comment.edited = true;
    comment.editedAt = new Date();
    await post.save();
    await post.populate('comments.author', 'username profilePicture');
    res.json(post);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Report a post
router.post('/:id/report', auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }
        // Validate reason and description
        const allowedReasons = [
            'Spam',
            'Inappropriate Content',
            'Harassment',
            'Hate Speech',
            'Violence',
            'Other'
        ];
        const { reason, description } = req.body;
        if (!reason || !allowedReasons.includes(reason)) {
            return res.status(400).json({ message: 'Invalid or missing reason. Allowed: ' + allowedReasons.join(', ') });
        }
        if (!description || description.length < 10 || description.length > 500) {
            return res.status(400).json({ message: 'Description is required (10-500 chars).' });
        }
        // Save to Report collection for admin
        await Report.create({
            reporter: req.user._id,
            reportedItem: post._id,
            itemType: 'Post',
            reason,
            description
        });
        res.json({ message: 'Post reported successfully' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get all post reports (admin only)
router.get('/reports/all', (req, res) => {
    // TODO: Add admin authentication middleware here!
    res.json(postReports);
});

// Get posts by user ID
router.get('/user/:userId', auth, async (req, res) => {
  try {
    console.log('Fetching posts for user:', req.params.userId);
    const posts = await Post.find({ author: req.params.userId })
      .populate('author', 'username profilePicture')
      .populate({
        path: 'comments.author',
        select: 'username profilePicture'
      })
      .sort({ createdAt: -1 });
    
    console.log(`Found ${posts.length} posts for user`);
    res.json(posts);
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// Save a post
router.post('/:id/save', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const user = await User.findById(req.user._id);
    if (!user.savedPosts.includes(post._id)) {
      user.savedPosts.push(post._id);
      await user.save();
    }

    res.json({ message: 'Post saved successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Unsave a post
router.post('/:id/unsave', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const user = await User.findById(req.user._id);
    user.savedPosts = user.savedPosts.filter(id => id.toString() !== post._id.toString());
    await user.save();

    res.json({ message: 'Post unsaved successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get saved posts
router.get('/saved', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('savedPosts');
    const savedPosts = await Post.find({ _id: { $in: user.savedPosts } })
      .populate('author', 'username profilePicture')
      .populate({
        path: 'comments.author',
        select: 'username profilePicture'
      })
      .sort({ createdAt: -1 });

    res.json(savedPosts);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get trending topics
router.get('/trending', async (req, res) => {
  try {
    const posts = await Post.find({}, 'content');
    const hashtags = {};
    
    // Extract hashtags from posts
    posts.forEach(post => {
      const matches = post.content.match(/#\w+/g);
      if (matches) {
        matches.forEach(tag => {
          hashtags[tag] = (hashtags[tag] || 0) + 1;
        });
      }
    });

    // Convert to array and sort by count
    const trendingTopics = Object.entries(hashtags)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json(trendingTopics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single post by ID
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username profilePicture avatar')
      .populate('comments.author', 'username profilePicture avatar');
    if (!post) return res.status(404).json({ message: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Report a comment
router.post('/:postId/comment/:commentId/report', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    // Validate reason and description
    const allowedReasons = [
      'Spam',
      'Inappropriate Content',
      'Harassment',
      'Hate Speech',
      'Violence',
      'Other'
    ];
    const { reason, description } = req.body;
    if (!reason || !allowedReasons.includes(reason)) {
      return res.status(400).json({ message: 'Invalid or missing reason. Allowed: ' + allowedReasons.join(', ') });
    }
    if (!description || description.length < 10 || description.length > 500) {
      return res.status(400).json({ message: 'Description is required (10-500 chars).' });
    }

    // Save to Report collection for admin
    await Report.create({
      reporter: req.user._id,
      reportedItem: comment._id,
      itemType: 'Comment',
      reason,
      description
    });

    res.json({ message: 'Comment reported successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router; 