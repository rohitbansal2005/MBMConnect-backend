const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    text: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
    content: {
        type: String,
        required: false,
        default: ''
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    media: {
        type: String,
        default: ''
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', ''],
        default: ''
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [commentSchema],
    image: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    edited: { type: Boolean, default: false },
    editedAt: { type: Date }
});

module.exports = mongoose.model('Post', postSchema); 