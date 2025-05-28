const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedItem: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'itemType',
        required: true
    },
    itemType: {
        type: String,
        enum: ['Post', 'Comment', 'User', 'Group'],
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: [
            'Spam',
            'Inappropriate Content',
            'Harassment',
            'Hate Speech',
            'Violence',
            'Other'
        ]
    },
    description: {
        type: String,
        required: true,
        minlength: 10,
        maxlength: 500
    },
    status: {
        type: String,
        enum: ['Pending', 'Under Review', 'Resolved', 'Dismissed'],
        default: 'Pending'
    },
    adminNotes: {
        type: String,
        maxlength: 1000
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolvedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ itemType: 1, reportedItem: 1 });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report; 