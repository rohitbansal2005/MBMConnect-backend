const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
    follower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    following: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create compound index for follower and following
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Create index for status
followSchema.index({ status: 1 });

// Create index for createdAt
followSchema.index({ createdAt: -1 });

// Pre-save middleware to update the updatedAt field
followSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to check if a follow relationship exists
followSchema.statics.checkFollowStatus = async function(followerId, followingId) {
    try {
        const follow = await this.findOne({
            follower: followerId,
            following: followingId
        });
        return follow;
    } catch (error) {
        console.error('Error checking follow status:', error);
        throw error;
    }
};

const Follow = mongoose.model('Follow', followSchema);

module.exports = Follow;