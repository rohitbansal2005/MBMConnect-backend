const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters long'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores']
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: true,
        minlength: [8, 'Password must be at least 8 characters long']
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    profilePicture: {
        type: String,
        default: ''
    },
    avatar: {
        type: String,
        default: ''
    },
    bio: {
        type: String,
        default: '',
        maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    savedPosts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    blockedUsers: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        blockedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isOnline: {
        type: Boolean,
        default: false
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationDate: {
        type: Date,
        default: null
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    premiumFeatures: {
        customThemes: {
            type: Boolean,
            default: false
        },
        prioritySupport: {
            type: Boolean,
            default: false
        },
        advancedAnalytics: {
            type: Boolean,
            default: false
        },
        customBadges: {
            type: Boolean,
            default: false
        },
        verifiedBadge: {
            type: Boolean,
            default: false
        }
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    showOnlineStatus: {
        type: Boolean,
        default: true
    },
    showLastSeen: {
        type: Boolean,
        default: true
    },
    theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
    },
    // New security fields
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    passwordChangedAt: {
        type: Date
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerificationToken: String,
    emailVerified: {
        type: Boolean,
        default: false
    },
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    twoFactorSecret: String,
    lastPasswordChange: {
        type: Date,
        default: Date.now
    },
    // Settings fields
    emailNotifications: {
        type: Boolean,
        default: true
    },
    pushNotifications: {
        type: Boolean,
        default: true
    },
    profileVisibility: {
        type: String,
        enum: ['public', 'private', 'connections'],
        default: 'public'
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        this.passwordChangedAt = Date.now();
        next();
    } catch (error) {
        next(error);
    }
});

// Method to check if password is correct
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Method to check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment failed login attempts
userSchema.methods.incrementLoginAttempts = async function() {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return await this.updateOne({
            $set: { failedLoginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }
    
    const updates = { $inc: { failedLoginAttempts: 1 } };
    if (this.failedLoginAttempts + 1 >= 5) {
        updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // Lock for 2 hours
    }
    return await this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema); 