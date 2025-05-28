const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const User = require('../models/User');
const Student = require('../models/Student');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

console.log('Follows routes loaded');

// Follow a user
router.post('/:userId', auth, async (req, res) => {
    try {
        // Log the complete request details
        console.log('=== Follow Request Details ===');
        console.log('Auth User:', req.user);
        console.log('Request Body:', req.body);
        console.log('Request Params:', req.params);
        console.log('Request Headers:', req.headers);

        const { userId } = req.params;
        const followerId = req.user._id;

        // Log the IDs being used
        console.log('IDs being used:', {
            followerId,
            userId,
            followerIdType: typeof followerId,
            userIdType: typeof userId
        });

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(followerId)) {
            console.log('Invalid ObjectId:', { userId, followerId });
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        // Check if trying to follow self
        if (userId === followerId) {
            console.log('User trying to follow self');
            return res.status(400).json({ message: 'You cannot follow yourself' });
        }

        // Check if user exists
        const userToFollow = await User.findById(userId);
        if (!userToFollow) {
            console.log('User not found:', userId);
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if already following or request pending
        const existingFollow = await Follow.findOne({ 
            follower: followerId, 
            following: userId,
            status: { $in: ['pending', 'accepted'] }
        });
        
        if (existingFollow) {
            if (existingFollow.status === 'pending') {
                return res.status(400).json({ message: 'Follow request already pending' });
            } else {
                return res.status(400).json({ message: 'You are already following this user' });
            }
        }

        // Create new follow relationship with pending status
        const followData = {
            follower: followerId,
            following: userId,
            status: 'pending'
        };

        console.log('Creating follow with data:', followData);

        const follow = new Follow(followData);
        await follow.save();
        console.log('Follow request created:', follow);

        // Create notification for follow request
        const notification = new Notification({
            recipient: userId,
            sender: followerId,
            type: 'follow_request',
            content: `${req.user.username} wants to follow you`,
            relatedId: follow._id,
            onModel: 'Follow'
        });

        await notification.save();
        console.log('Notification created:', notification);

        res.status(201).json({
            message: 'Follow request sent successfully',
            follow
        });
    } catch (error) {
        console.error('Error in follow:', {
            message: error.message,
            stack: error.stack,
            userId: req.params.userId,
            followerId: req.user._id,
            user: req.user,
            error: error
        });
        res.status(500).json({ message: 'Error following user', error: error.message });
    }
});

// Unfollow a user
router.delete('/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const followerId = req.user.userId;

        const follow = await Follow.findOneAndDelete({
            follower: followerId,
            following: userId
        });

        if (!follow) {
            return res.status(404).json({ message: 'Follow relationship not found' });
        }

        // Update student models
        const followerStudent = await Student.findOne({ user: followerId });
        const followingStudent = await Student.findOne({ user: userId });

        if (followerStudent && followingStudent) {
            // Remove from following list
            followerStudent.following = followerStudent.following.filter(id => id.toString() !== userId);
            await followerStudent.save();

            // Remove from followers list
            followingStudent.followers = followingStudent.followers.filter(id => id.toString() !== followerId);
            await followingStudent.save();
        }

        res.json({ message: 'Unfollowed successfully' });
    } catch (error) {
        console.error('Error in unfollow:', error);
        res.status(500).json({ message: 'Error unfollowing user', error: error.message });
    }
});

// Get followers list
router.get('/followers/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const followers = await Follow.find({ 
            following: userId,
            status: { $in: ['accepted', 'pending'] }  // Only get accepted and pending follows
        })
        .populate({
            path: 'follower',
            select: 'username profilePicture avatar _id'
        })
        .sort({ createdAt: -1 });

        // Format the response to ensure all user data is properly structured
        const formattedFollowers = followers.map(follow => {
            if (!follow.follower) return null;
            return {
                _id: follow._id,
                status: follow.status,
                follower: {
                    _id: follow.follower._id,
                    username: follow.follower.username || 'Unknown User',
                    profilePicture: follow.follower.profilePicture || '',
                    avatar: follow.follower.avatar || ''
                }
            };
        }).filter(follow => follow !== null);

        res.json(formattedFollowers);
    } catch (error) {
        res.status(500).json({ message: 'Error getting followers', error: error.message });
    }
});

// Get following list
router.get('/following/:userId', auth, async (req, res) => {
    try {
        const { userId } = req.params;
        const following = await Follow.find({ 
            follower: userId,
            status: { $in: ['accepted', 'pending'] }  // Only get accepted and pending follows
        })
        .populate({
            path: 'following',
            select: 'username profilePicture avatar _id'
        })
        .sort({ createdAt: -1 });

        // Format the response to ensure all user data is properly structured
        const formattedFollowing = following.map(follow => {
            if (!follow.following) return null;
            return {
                _id: follow._id,
                status: follow.status,
                following: {
                    _id: follow.following._id,
                    username: follow.following.username || 'Unknown User',
                    profilePicture: follow.following.profilePicture || '',
                    avatar: follow.following.avatar || ''
                }
            };
        }).filter(follow => follow !== null);

        res.json(formattedFollowing);
    } catch (error) {
        res.status(500).json({ message: 'Error getting following list', error: error.message });
    }
});

// Get pending follow requests
router.get('/pending', auth, async (req, res) => {
    try {
        const pendingRequests = await Follow.find({
            following: req.user.userId,
            status: 'pending'
        })
        .populate('follower', 'username profilePicture')
        .sort({ createdAt: -1 });

        res.json(pendingRequests);
    } catch (error) {
        console.error('Error getting pending requests:', error);
        res.status(500).json({ message: 'Error getting pending requests', error: error.message });
    }
});

// Accept follow request
router.put('/accept/:followId', auth, async (req, res) => {
    try {
        console.log('Accept follow request route hit');
        console.log('io object in follows route:', req.app.get('io') ? 'Available' : 'Not available');
        const { followId } = req.params;
        const userId = req.user.userId;

        const follow = await Follow.findOne({
            _id: followId,
            following: userId,
            status: 'pending'
        });

        if (!follow) {
            return res.status(404).json({ message: 'Follow request not found' });
        }

        follow.status = 'accepted';
        await follow.save();

        // Create notification for follow acceptance
        const notification = new Notification({
            recipient: follow.follower,
            sender: userId,
            type: 'follow_accepted',
            content: `${req.user.username} accepted your follow request`,
            relatedId: follow._id,
            onModel: 'Follow'
        });

        await notification.save();

        // Update student models
        const followerStudent = await Student.findOne({ user: follow.follower });
        const followingStudent = await Student.findOne({ user: follow.following });

        if (followerStudent && followingStudent) {
            // Add to following list
            if (!followerStudent.following.includes(follow.following)) {
                followerStudent.following.push(follow.following);
                await followerStudent.save();
            }

            // Add to followers list
            if (!followingStudent.followers.includes(follow.follower)) {
                followingStudent.followers.push(follow.follower);
                await followingStudent.save();
            }
        }

        // Emit Socket.IO event
        const io = req.app.get('io');
        if (io) {
            console.log('Emitting followStatusUpdated event');
            io.to(follow.follower.toString()).emit('followStatusUpdated', {
                followerId: follow.follower.toString(),
                followingId: follow.following.toString(),
                status: 'accepted'
            });
             io.to(follow.following.toString()).emit('followStatusUpdated', {
                followerId: follow.follower.toString(),
                followingId: follow.following.toString(),
                status: 'accepted'
            });
        }

        res.json({ message: 'Follow request accepted', follow });
    } catch (error) {
        console.error('Error accepting follow request:', error);
        res.status(500).json({ message: 'Error accepting follow request', error: error.message });
    }
});

// Reject follow request
router.put('/reject/:followId', auth, async (req, res) => {
    try {
        console.log('Reject follow request route hit');
        console.log('io object in follows route:', req.app.get('io') ? 'Available' : 'Not available');
        const { followId } = req.params;
        const userId = req.user.userId;

        const follow = await Follow.findOne({
            _id: followId,
            following: userId,
            status: 'pending'
        });

        if (!follow) {
            return res.status(404).json({ message: 'Follow request not found' });
        }

        follow.status = 'rejected';
        await follow.save();

        // Emit Socket.IO event
        const io = req.app.get('io');
        if (io) {
             console.log('Emitting followStatusUpdated event for rejection');
             io.to(follow.follower.toString()).emit('followStatusUpdated', {
                followerId: follow.follower.toString(),
                followingId: follow.following.toString(),
                status: 'rejected'
            });
        }

        res.json({ message: 'Follow request rejected' });
    } catch (error) {
        console.error('Error rejecting follow request:', error);
        res.status(500).json({ message: 'Error rejecting follow request', error: error.message });
    }
});

// Check if following
router.get('/check/:userId', auth, async (req, res) => {
    try {
        console.log('=== Check Follow Status Route ===');
        console.log('Request received for user ID:', req.params.userId);
        console.log('Auth user:', req.user);
        
        const { userId } = req.params;
        const followerId = req.user.userId;

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('Invalid user ID format:', userId);
            return res.status(400).json({ message: 'Invalid user ID format' });
        }

        const follow = await Follow.findOne({
            follower: followerId,
            following: userId
        });

        console.log('Follow status found:', follow);

        res.json({
            isFollowing: follow?.status === 'accepted',
            status: follow ? follow.status : null
        });
    } catch (error) {
        console.error('Error checking follow status:', error);
        res.status(500).json({ message: 'Error checking follow status', error: error.message });
    }
});

// Allow POST as alias for PUT for accepting follow requests
router.post('/accept/:followId', auth, async (req, res, next) => {
  req.method = 'PUT';
  next();
});

module.exports = router; 