const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fullName: {
        type: String,
        required: true
    },
    rollNumber: {
        type: String,
        required: true,
        unique: true
    },
    branch: {
        type: String,
        required: true
    },
    session: {
        type: String,
        required: true
    },
    semester: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        default: 'Not specified'
    },
    address: {
        type: String,
        default: 'Not specified'
    },
    bio: {
        type: String,
        default: 'No bio yet'
    },
    avatar: {
        type: String,
        default: ''
    },
    skills: [{
        type: String
    }],
    education: [{
        degree: String,
        institution: String,
        year: String
    }],
    experience: [{
        position: String,
        company: String,
        duration: String
    }],
    socialLinks: {
        linkedin: {
            type: String,
            default: ''
        },
        github: {
            type: String,
            default: ''
        },
        website: {
            type: String,
            default: ''
        },
        instagram: {
            type: String,
            default: ''
        }
    },
    posts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    }],
    connections: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    projects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    }],
    recentActivity: [{
        title: String,
        date: {
            type: Date,
            default: Date.now
        }
    }],
    privacy: {
        profile: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        photo: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        email: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        phone: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'private'
        },
        address: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'private'
        },
        bio: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        education: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        experience: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        skills: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        socialLinks: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        followers: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        following: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        }
    },
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Add virtual for followers count
studentSchema.virtual('followersCount').get(function() {
    return this.followers.length;
});

// Add virtual for following count
studentSchema.virtual('followingCount').get(function() {
    return this.following.length;
});

// Create indexes
studentSchema.index({ user: 1 });
studentSchema.index({ rollNumber: 1 }, { unique: true });

module.exports = mongoose.model('Student', studentSchema); 