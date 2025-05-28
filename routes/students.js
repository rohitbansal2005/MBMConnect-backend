const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const mongoose = require('mongoose');
const Project = require('../models/Project');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'profile-photos');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Upload profile photo
router.post('/:id/photo', auth, upload.single('photo'), async (req, res) => {
    try {
        const userId = req.user._id;
        const studentId = req.params.id;

        // Find the student profile
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: 'Student profile not found' });
        }

        // Check if user is trying to update their own profile
        if (String(student.user) !== String(userId)) {
            return res.status(403).json({ message: 'You can only update your own profile photo' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No photo uploaded' });
        }

        // Get the relative path for storage (convert backslashes to forward slashes)
        const relativePath = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');

        // Update the profile with new photo path
        const updatedStudent = await Student.findByIdAndUpdate(
            studentId,
            { 
                $set: { 
                    avatar: relativePath,
                    profilePicture: relativePath
                } 
            },
            { new: true }
        ).populate('user', 'username email');

        // Also update the user's profilePicture field
        await User.findByIdAndUpdate(
            student.user,
            { $set: { profilePicture: relativePath } }
        );

        // Return the updated student with the avatar path
        res.json({
            ...updatedStudent.toObject(),
            avatar: relativePath
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ message: 'Error uploading photo: ' + error.message });
    }
});

// Get student profile
router.get('/:id', auth, async (req, res) => {
    try {
        console.log('GET /students/:id - Request received');
        console.log('User from auth middleware:', req.user);
        console.log('Requested student ID:', req.params.id);

        // Basic validation
        if (!req.params.id) {
            console.log('No ID provided in request');
            return res.status(400).json({ message: 'ID is required' });
        }

        // Validate MongoDB ObjectId format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log('Invalid MongoDB ObjectId format:', req.params.id);
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        // First try to find student by ID
        let student = await Student.findById(req.params.id)
            .populate('user', 'username email profilePicture')
            .populate('projects')
            .populate('followers', 'username email profilePicture')
            .populate('following', 'username email profilePicture')
            .populate({
                path: 'posts',
                populate: {
                    path: 'author',
                    select: 'username profilePicture'
                }
            });

        // If not found by ID, try to find by user ID
        if (!student) {
            student = await Student.findOne({ user: req.params.id })
                .populate('user', 'username email profilePicture')
                .populate('projects')
                .populate('followers', 'username email profilePicture')
                .populate('following', 'username email profilePicture')
                .populate({
                    path: 'posts',
                    populate: {
                        path: 'author',
                        select: 'username profilePicture'
                    }
                });
        }

        if (!student) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        // Get populated data
        const populatedStudent = await Student.findById(student._id)
            .populate('user', 'username email profilePicture')
            .populate('posts')
            .populate('connections')
            .populate('followers', 'username email profilePicture')
            .populate('following', 'username email profilePicture')
            .populate({
                path: 'projects',
                options: { 
                    lean: true,
                    sort: { createdAt: -1 }
                }
            });

        if (!populatedStudent) {
            throw new Error('Failed to populate student data');
        }

        // Handle avatar URL
        const studentData = populatedStudent.toObject();
        if (studentData.avatar) {
            studentData.avatar = studentData.avatar.replace(/\\/g, '/');
        }

        // Ensure arrays exist
        studentData.followers = studentData.followers || [];
        studentData.following = studentData.following || [];
        studentData.projects = studentData.projects || [];

        // Format project dates
        studentData.projects = studentData.projects.map(project => ({
            ...project,
            startDate: project.startDate ? new Date(project.startDate).toISOString() : null,
            endDate: project.endDate ? new Date(project.endDate).toISOString() : null,
            technologies: project.technologies || [],
            images: project.images || []
        }));

        // Check if the requesting user is the profile owner
        const isOwner = req.user._id === studentData.user._id.toString();
        
        // If not the owner, apply privacy settings
        if (!isOwner) {
            // Check if the requesting user is a follower
            const isFollower = studentData.followers.some(
                follower => follower._id.toString() === req.user._id
            );

            // Apply privacy settings for each field
            const privacyFields = {
                photo: 'photo',
                email: 'email',
                phone: 'phone',
                address: 'address',
                bio: 'bio',
                education: 'education',
                experience: 'experience',
                skills: 'skills',
                socialLinks: 'socialLinks',
                followers: 'followers',
                following: 'following'
            };

            Object.entries(privacyFields).forEach(([field, privacyKey]) => {
                const privacyLevel = studentData.privacy[privacyKey];
                
                if (privacyLevel === 'private' || 
                    (privacyLevel === 'friends' && !isFollower)) {
                    if (field === 'socialLinks') {
                        studentData[field] = {
                            linkedin: 'Private',
                            github: 'Private',
                            website: 'Private',
                            instagram: 'Private'
                        };
                    } else if (Array.isArray(studentData[field])) {
                        studentData[field] = [];
                    } else {
                        studentData[field] = 'Private';
                    }
                }
            });

            // Handle profile-level privacy
            if (studentData.privacy.profile === 'private' || 
                (studentData.privacy.profile === 'friends' && !isFollower)) {
                // Hide all private information
                Object.keys(privacyFields).forEach(field => {
                    if (field === 'socialLinks') {
                        studentData[field] = {
                            linkedin: 'Private',
                            github: 'Private',
                            website: 'Private',
                            instagram: 'Private'
                        };
                    } else if (Array.isArray(studentData[field])) {
                        studentData[field] = [];
                    } else {
                        studentData[field] = 'Private';
                    }
                });
            }
        }

        return res.json(studentData);
    } catch (error) {
        console.error('Error in GET /students/:id:', error);
        return res.status(500).json({
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Update student profile
router.put('/:id', auth, async (req, res) => {
    try {
        const userId = req.user._id;
        const studentId = req.params.id;

        console.log('Update request details:', {
            userId: userId,
            studentId: studentId,
            requestBody: req.body
        });

        // Find the student profile
        const student = await Student.findById(studentId);
        if (!student) {
            console.log('Student profile not found');
            return res.status(404).json({ message: 'Student profile not found' });
        }

        console.log('Found student profile:', {
            studentUserId: student.user,
            requestingUserId: userId,
            isMatch: String(student.user) === String(userId)
        });

        // Check if user is trying to update their own profile
        if (String(student.user) !== String(userId)) {
            console.log('Unauthorized update attempt');
            return res.status(403).json({ message: 'You can only update your own profile' });
        }

        // If updating privacy settings
        if (req.body.privacy) {
            console.log('Updating privacy settings:', req.body.privacy);
            const validPrivacyLevels = ['public', 'friends', 'private'];
            const validPrivacyFields = [
                'profile', 'photo', 'email', 'phone', 'address', 'bio',
                'education', 'experience', 'skills', 'socialLinks',
                'followers', 'following'
            ];

            // Validate privacy settings
            for (const [field, level] of Object.entries(req.body.privacy)) {
                if (!validPrivacyFields.includes(field)) {
                    return res.status(400).json({ 
                        message: `Invalid privacy field: ${field}` 
                    });
                }
                if (!validPrivacyLevels.includes(level)) {
                    return res.status(400).json({ 
                        message: `Invalid privacy level for ${field}: ${level}` 
                    });
                }
            }

            // Update privacy settings
            student.privacy = {
                ...student.privacy,
                ...req.body.privacy
            };
        }

        // Update other profile fields
        const allowedUpdates = [
            'fullName', 'rollNumber', 'branch', 'session', 'semester',
            'email', 'phone', 'address', 'bio', 'skills',
            'education', 'experience', 'socialLinks'
        ];

        for (const [field, value] of Object.entries(req.body)) {
            if (allowedUpdates.includes(field)) {
                // Ensure education and experience are arrays
                if ((field === 'education' || field === 'experience') && !Array.isArray(value)) {
                    return res.status(400).json({ message: `${field} must be an array` });
                }
                student[field] = value;
            }
        }

        // Save the updated profile
        const updatedStudent = await student.save();
        console.log('Profile updated successfully');

        // Populate user details
        await updatedStudent.populate('user', 'username email');
        
        // Return the updated student
        res.json(updatedStudent);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ 
            message: 'Error updating profile: ' + error.message 
        });
    }
});

// Create student profile
router.post('/', auth, async (req, res) => {
    try {
        console.log('Creating student profile:', req.body);

        // Check if student profile already exists
        const existingStudent = await Student.findOne({ user: req.user._id });
        if (existingStudent) {
            return res.status(400).json({ message: 'Student profile already exists' });
        }

        // Create student profile
        const student = new Student({
            user: req.user._id,
            fullName: req.body.fullName,
            rollNumber: req.body.rollNumber,
            branch: req.body.branch,
            session: req.body.session,
            semester: req.body.semester,
            email: req.body.email
        });

        await student.save();
        console.log('Student profile created:', student);

        res.status(201).json(student);
    } catch (error) {
        console.error('Error creating student profile:', error);
        res.status(500).json({ message: error.message });
    }
});

// Create new student profile
router.post('/', auth, async (req, res) => {
    try {
        // Check if profile already exists
        const existingProfile = await Student.findOne({ user: req.user._id });
        if (existingProfile) {
            return res.status(400).json({ message: 'Profile already exists' });
        }

        // Create new profile with default values
        const newProfile = new Student({
            user: req.user._id,
            fullName: req.user.username || 'Not specified',
            rollNumber: `TEMP-${Date.now()}`, // Temporary roll number
            branch: 'Not specified',
            session: 'Not specified',
            semester: 'Not specified',
            email: req.user.email || 'Not specified',
            bio: 'No bio yet',
            avatar: '',
            skills: [],
            education: [],
            experience: [],
            socialLinks: {
                linkedin: '',
                github: '',
                website: '',
                instagram: ''
            },
            posts: [],
            connections: [],
            projects: [],
            recentActivity: [],
            followers: [],
            following: []
        });

        await newProfile.save();

        // Populate the user field
        const populatedProfile = await Student.findById(newProfile._id)
            .populate('user', 'username email profilePicture');

        res.status(201).json(populatedProfile);
    } catch (error) {
        console.error('Error creating profile:', error);
        res.status(500).json({ message: 'Error creating profile: ' + error.message });
    }
});

module.exports = router; 