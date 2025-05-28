const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { check, validationResult } = require('express-validator');
const Message = require('../models/Message');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/groups');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5000000 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

// @route   POST api/groups
// @desc    Create a group
// @access  Private
router.post('/', [auth, upload.single('coverImage'), [
    check('name', 'Name is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty()
]], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, description, isPrivate, rules, tags, selectedFriends } = req.body;

        // Parse selectedFriends if it's a string
        let selectedFriendsArr = [];
        if (selectedFriends) {
            if (typeof selectedFriends === 'string') {
                try {
                    selectedFriendsArr = JSON.parse(selectedFriends);
                } catch (e) {
                    selectedFriendsArr = [];
                }
            } else if (Array.isArray(selectedFriends)) {
                selectedFriendsArr = selectedFriends;
            }
        }

        const newGroup = new Group({
            name,
            description,
            type: 'custom',
            creator: req.user.id,
            admins: [req.user.id],
            members: selectedFriendsArr.length > 0 ? [...selectedFriendsArr, req.user.id] : [req.user.id],
            isPrivate: isPrivate === 'true',
            rules: rules ? rules.split(',').map(rule => rule.trim()) : [],
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            coverImage: req.file ? req.file.path : null,
            allowMemberPosts: true,
            allowMemberChat: true,
            memberCount: selectedFriendsArr.length + 1
        });

        const group = await newGroup.save();
        
        // Populate the group with member details before sending response
        await group.populate('members', 'username profilePicture');
        await group.populate('admins', 'username profilePicture');
        
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/groups
// @desc    Get all groups
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const groups = await Group.find()
            .populate('creator', 'username profilePicture')
            .populate('members', 'username profilePicture')
            .populate('admins', 'username profilePicture')
            .sort({ createdAt: -1 });

        // Filter groups based on type and user role
        const user = await User.findById(req.user.id);
        const filteredGroups = groups.filter(group => {
            if (group.type === 'admin') {
                return true; // Show all admin groups
            } else {
                return true; // Show all custom groups
            }
        });

        res.json(filteredGroups);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/groups/:id
// @desc    Get group by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id)
            .populate('creator', 'username profilePicture')
            .populate('members', 'username profilePicture')
            .populate('admins', 'username profilePicture')
            .populate('pendingMembers', 'username profilePicture');

        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        res.json(group);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Group not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id
// @desc    Update a group
// @access  Private
router.put('/:id', [auth, upload.single('coverImage')], async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is admin or creator
        if (group.creator.toString() !== req.user.id && !group.admins.includes(req.user.id)) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        const { name, description, isPrivate, rules, tags, allowMemberPosts, allowMemberChat } = req.body;

        // Update group fields
        group.name = name || group.name;
        group.description = description || group.description;
        group.isPrivate = isPrivate === 'true' || group.isPrivate;
        group.rules = rules ? rules.split(',').map(rule => rule.trim()) : group.rules;
        group.tags = tags ? tags.split(',').map(tag => tag.trim()) : group.tags;
        group.allowMemberPosts = allowMemberPosts === 'true' || group.allowMemberPosts;
        group.allowMemberChat = allowMemberChat === 'true' || group.allowMemberChat;
        
        if (req.file) {
            group.coverImage = req.file.path;
        }

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/groups/:id
// @desc    Delete a group
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is creator
        if (group.creator.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await group.remove();
        res.json({ msg: 'Group removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Group not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id/join
// @desc    Join a group
// @access  Private
router.put('/:id/join', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is already a member
        if (group.members.includes(req.user.id)) {
            return res.status(400).json({ msg: 'Already a member of this group' });
        }

        // Check if user is in pending members
        if (group.pendingMembers.includes(req.user.id)) {
            return res.status(400).json({ msg: 'Already requested to join this group' });
        }

        if (group.isPrivate) {
            // Add to pending members if group is private
            group.pendingMembers.push(req.user.id);
        } else {
            // Add directly to members if group is public
            group.members.push(req.user.id);
        }

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id/leave
// @desc    Leave a group
// @access  Private
router.put('/:id/leave', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is a member
        if (!group.members.includes(req.user.id)) {
            return res.status(400).json({ msg: 'Not a member of this group' });
        }

        // Remove from members
        group.members = group.members.filter(member => member.toString() !== req.user.id);

        // Remove from admins if user is an admin
        if (group.admins.includes(req.user.id)) {
            group.admins = group.admins.filter(admin => admin.toString() !== req.user.id);
        }

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id/approve/:userId
// @desc    Approve a member request
// @access  Private
router.put('/:id/approve/:userId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is admin or creator
        if (group.creator.toString() !== req.user.id && !group.admins.includes(req.user.id)) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Check if user is in pending members
        if (!group.pendingMembers.includes(req.params.userId)) {
            return res.status(400).json({ msg: 'User has not requested to join' });
        }

        // Remove from pending members and add to members
        group.pendingMembers = group.pendingMembers.filter(member => member.toString() !== req.params.userId);
        group.members.push(req.params.userId);

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id/reject/:userId
// @desc    Reject a member request
// @access  Private
router.put('/:id/reject/:userId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is admin or creator
        if (group.creator.toString() !== req.user.id && !group.admins.includes(req.user.id)) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Remove from pending members
        group.pendingMembers = group.pendingMembers.filter(member => member.toString() !== req.params.userId);

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id/make-admin/:userId
// @desc    Make a member an admin
// @access  Private
router.put('/:id/make-admin/:userId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is creator
        if (group.creator.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Only creator can make admins' });
        }

        // Check if user is a member
        if (!group.members.includes(req.params.userId)) {
            return res.status(400).json({ msg: 'User is not a member of this group' });
        }

        // Add to admins
        group.admins.push(req.params.userId);

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/groups/:id/remove-admin/:userId
// @desc    Remove admin status from a member
// @access  Private
router.put('/:id/remove-admin/:userId', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if user is creator
        if (group.creator.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Only creator can remove admins' });
        }

        // Remove from admins
        group.admins = group.admins.filter(admin => admin.toString() !== req.params.userId);

        await group.save();
        res.json(group);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/groups/:groupId/messages
// @desc    Get messages for a group
// @access  Private
router.get('/:groupId/messages', auth, async (req, res) => {
    try {
        const messages = await Message.find({ group: req.params.groupId })
            .populate('sender', 'username profilePicture avatar') // Assuming messages are linked to users and sender is populated
            .sort({ createdAt: 1 }); // Sort by creation date

        // Although a 404 for no messages is possible, returning an empty array is often better UX for a chat
        // if (!messages || messages.length === 0) {
        //     return res.status(404).json({ msg: 'Messages not found for this group' });
        // }

        res.json(messages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/groups/:groupId/messages
// @desc    Send a message to a group
// @access  Private
router.post('/:groupId/messages', auth, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) {
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Check if the user is a member of the group (optional, but good practice)
        // This assumes your Group model has a 'members' array of user IDs
        if (!group.members.includes(req.user.id)) {
             return res.status(403).json({ msg: 'You are not a member of this group' });
        }

        const newMessage = new Message({
            group: req.params.groupId,
            sender: req.user.id,
            text: req.body.text,
        });

        await newMessage.save();

        // Populate the sender information for the emitted message
        await newMessage.populate('sender', 'username profilePicture avatar');

        // Emit the new message to the group using Socket.IO (assuming you have Socket.IO set up)
        const io = req.app.get('io');
        if (io) {
            // Emit to the group's room
            io.to(req.params.groupId).emit('receiveGroupMessage', newMessage);
        }

        res.json(newMessage);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;