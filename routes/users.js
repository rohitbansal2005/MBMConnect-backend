const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const Student = require('../models/Student');
const Post = require('../models/Post');
const Message = require('../models/Message');
const UserSettings = require('../models/UserSettings');
const isBlocked = require('../utils/isBlocked');

// Get all users
router.get('/', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    try {
        console.log('Fetching user data for ID:', req.user._id);
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('User found:', user);
        res.json({ 
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                profilePicture: user.profilePicture,
                bio: user.bio,
                followers: user.followers,
                following: user.following,
                createdAt: user.createdAt
            }
        });
    } catch (err) {
        console.error('Error in /me route:', err);
        res.status(500).json({ message: err.message });
    }
});

// Search users by name or email
router.get('/search', auth, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ message: 'Search query is required' });
        }

        // Find users matching the query
        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } },
                { fullName: { $regex: query, $options: 'i' } }
            ]
        }).select('_id username profilePicture avatar');

        // For each user, get their Student profile
        const results = await Promise.all(users.map(async user => {
            const student = await Student.findOne({ user: user._id });
            return {
                _id: user._id,
                username: user.username,
                profilePicture: user.profilePicture,
                avatar: user.avatar,
                branch: student?.branch || '',
                session: student?.session || '',
                semester: student?.semester || '',
                fullName: student?.fullName || '',
                bio: student?.bio || '',
            };
        }));

        res.json(results);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ message: 'Error searching users' });
    }
});

// Place /blocked route BEFORE any /:id or similar parameterized routes
router.get('/blocked', auth, async (req, res) => {
    console.log('Blocked route hit!'); // Debug log
    try {
        const userId = req.user._id || req.user.userId;
        console.log('Fetching blocked users for user:', userId);
        
        // First verify the user exists
        const user = await User.findById(userId);
        if (!user) {
            console.error('User not found:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        // Then get the populated user data
        const populatedUser = await User.findById(userId)
            .populate({
                path: 'blockedUsers.user',
                select: 'username profilePicture avatar',
                model: 'User'
            });
            
        if (!populatedUser) {
            console.error('Failed to populate blocked users for user:', userId);
            return res.status(500).json({ error: 'Failed to populate blocked users' });
        }

        // Map the blocked users to the expected format
        const blocked = (populatedUser.blockedUsers || []).map(b => ({
            _id: b.user._id,
            username: b.user.username,
            profilePicture: b.user.profilePicture,
            avatar: b.user.avatar,
            blockedAt: b.blockedAt
        }));
        
        console.log('Returning blocked users:', blocked);
        res.json(blocked);
    } catch (error) {
        console.error('Get blocked users error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch blocked users', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get user by username
router.get('/findByUsername/:username', auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select('_id username profilePicture'); // Select only necessary fields
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error finding user by username:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's friends
router.get('/friends', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Get all users that are friends with the current user
        const friends = await User.find({
            _id: { $in: user.friends }
        }).select('username profilePicture avatar');

        res.json(friends);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Get user by ID
router.get('/:id', auth, async (req, res) => {
    try {
        // Restrict access if requester is blocked by the profile owner
        if (await isBlocked(req.user._id, req.params.id)) {
            return res.status(403).json({ message: 'You are blocked by this user.' });
        }
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        console.log('Login attempt:', { email: req.body.email });
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Please provide both email and password' 
            });
        }
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found:', email);
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        // Check if account is locked
        if (user.isLocked()) {
            return res.status(403).json({
                success: false,
                message: 'Account is locked. Please try again later.'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log('Invalid password for user:', email);
            // Increment failed login attempts
            await user.incrementLoginAttempts();
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        // Reset failed login attempts on successful login
        if (user.failedLoginAttempts > 0) {
            user.failedLoginAttempts = 0;
            user.lockUntil = undefined;
            await user.save();
        }

        console.log('Login successful for user:', email);

        // Create JWT token
        const tokenPayload = {
            _id: user._id.toString(),
            role: user.role || 'user'
        };

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }

        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Get user data without password
        const userData = {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            role: user.role || 'user',
            profilePicture: user.profilePicture,
            bio: user.bio,
            followers: user.followers,
            following: user.following,
            createdAt: user.createdAt
        };

        console.log('Sending response with token and user data');
        res.json({
            success: true,
            token,
            user: userData
        });
    } catch (error) {
        console.error('Login error:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create a new user
router.post('/', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        user = new User({
            username,
            email,
            password: hashedPassword
        });

        await user.save();

        // Create student profile
        const student = new Student({
            user: user._id,
            fullName: username,
            rollNumber: `MBM${Date.now()}`, // Temporary roll number
            branch: 'Not specified',
            session: 'Not specified',
            semester: 'Not specified',
            email: email
        });

        await student.save();

        // Create JWT token
        const token = jwt.sign(
            { _id: user._id, role: user.role },
            process.env.JWT_SECRET || 'your_jwt_secret_key_here',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                profilePicture: user.profilePicture,
                bio: user.bio,
                followers: user.followers,
                following: user.following,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update user profile
router.put('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (req.body.username) user.username = req.body.username;
        if (req.body.email) user.email = req.body.email;
        if (req.body.bio) user.bio = req.body.bio;
        if (req.body.profilePicture) user.profilePicture = req.body.profilePicture;

        const updatedUser = await user.save();
        res.json(updatedUser);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Follow/Unfollow user
router.put('/:id/follow', async (req, res) => {
    try {
        const userToFollow = await User.findById(req.params.id);
        const currentUser = await User.findById(req.body.userId);

        if (!userToFollow || !currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (currentUser.following.includes(req.params.id)) {
            // Unfollow
            currentUser.following = currentUser.following.filter(id => id.toString() !== req.params.id);
            userToFollow.followers = userToFollow.followers.filter(id => id.toString() !== req.body.userId);
        } else {
            // Follow
            currentUser.following.push(req.params.id);
            userToFollow.followers.push(req.body.userId);
        }

        await currentUser.save();
        await userToFollow.save();
        res.json({ message: 'Follow status updated' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get suggested users
router.get('/suggested', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId)
      .populate('followers following');

    // Get users who are not already followed
    const suggestedUsers = await User.find({
      _id: { 
        $nin: [
          req.user.userId,
          ...currentUser.following.map(f => f._id)
        ]
      }
    })
    .select('username profilePicture avatar')
    .limit(5);

    // Calculate mutual friends for each suggested user
    const usersWithMutualFriends = await Promise.all(
      suggestedUsers.map(async (user) => {
        const userFollowers = await User.findById(user._id)
          .select('followers');
        
        const mutualFriends = currentUser.followers.filter(follower => 
          userFollowers.followers.includes(follower._id)
        ).length;

        return {
          ...user.toObject(),
          mutualFriends
        };
      })
    );

    res.json(usersWithMutualFriends);
  } catch (error) {
    console.error('Error in suggested users:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update delete account route to require password and reason
router.delete('/me', auth, async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId;
        const { password, reason } = req.body;
        if (!password || !reason) {
            return res.status(400).json({ message: 'Password and reason are required.' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect password.' });
        }
        // Optionally log/store the reason (here we just log it)
        console.log(`User ${user.email} is deleting their account. Reason: ${reason}`);
        // Delete associated student profile if exists
        await Student.findOneAndDelete({ user: user._id });
        // Delete user's posts
        await Post.deleteMany({ author: user._id });
        // Delete user's messages
        await Message.deleteMany({ 
            $or: [
                { sender: user._id },
                { recipient: user._id }
            ]
        });
        // Remove user from followers/following lists
        await User.updateMany(
            { followers: user._id },
            { $pull: { followers: user._id } }
        );
        await User.updateMany(
            { following: user._id },
            { $pull: { following: user._id } }
        );
        // Delete user settings
        await UserSettings.findOneAndDelete({ user: user._id });
        // Finally delete the user
        await user.deleteOne();
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ message: 'Error deleting account' });
    }
});

// Block a user
router.post('/block/:userId', auth, async (req, res) => {
    try {
        const userToBlock = await User.findById(req.params.userId);
        if (!userToBlock) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if already blocked
        const alreadyBlocked = (req.user.blockedUsers || []).some(b => b.user.toString() === req.params.userId);
        if (alreadyBlocked) {
            return res.status(400).json({ error: 'User is already blocked' });
        }

        // Add to blocked users with date
        await User.findByIdAndUpdate(req.user._id, {
            $push: { blockedUsers: { user: req.params.userId, blockedAt: new Date() } }
        });

        // Remove from followers/following if exists
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { 
                followers: req.params.userId,
                following: req.params.userId
            }
        });

        await User.findByIdAndUpdate(req.params.userId, {
            $pull: { 
                followers: req.user._id,
                following: req.user._id
            }
        });

        res.json({ message: 'User blocked successfully' });
    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({ error: 'Failed to block user' });
    }
});

// Unblock a user
router.post('/unblock/:userId', auth, async (req, res) => {
    try {
        // Remove from blocked users
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { blockedUsers: { user: req.params.userId } }
        });

        res.json({ message: 'User unblocked successfully' });
    } catch (error) {
        console.error('Unblock user error:', error);
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

// Add a catch-all for unmatched routes at the end for debugging
router.use((req, res) => {
    res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

module.exports = router; 