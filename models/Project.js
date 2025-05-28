const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['ongoing', 'completed', 'on-hold'],
        default: 'ongoing'
    },
    technologies: [{
        type: String
    }],
    githubLink: {
        type: String
    },
    liveLink: {
        type: String
    },
    images: [{
        type: String
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

projectSchema.index({ student: 1, createdAt: -1 });

const Project = mongoose.model('Project', projectSchema);

module.exports = Project; 