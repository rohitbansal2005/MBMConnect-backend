const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  coverImage: {
    type: String
  },
  type: {
    type: String,
    enum: ['admin', 'custom'],
    default: 'custom'
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pendingMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  rules: [{
    type: String
  }],
  tags: [{
    type: String
  }],
  posts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  events: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  memberCount: {
    type: Number,
    default: 1
  },
  allowMemberPosts: {
    type: Boolean,
    default: true
  },
  allowMemberChat: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
groupSchema.index({ name: 'text', description: 'text' });
groupSchema.index({ type: 1 });
groupSchema.index({ creator: 1 });
groupSchema.index({ members: 1 });
groupSchema.index({ tags: 1 });

// Virtual for member count
groupSchema.virtual('membersCount').get(function() {
  return this.members.length;
});

// Pre-save middleware to update memberCount
groupSchema.pre('save', function(next) {
  this.memberCount = this.members.length;
  next();
});

// Method to check if a user is a member
groupSchema.methods.isMember = function(userId) {
  return this.members.includes(userId);
};

// Method to check if a user is an admin
groupSchema.methods.isAdmin = function(userId) {
  return this.admins.includes(userId);
};

// Method to check if a user is the creator
groupSchema.methods.isCreator = function(userId) {
  return this.creator.toString() === userId.toString();
};

// Method to add a member
groupSchema.methods.addMember = async function(userId) {
  if (!this.members.includes(userId)) {
    this.members.push(userId);
    await this.save();
  }
};

// Method to remove a member
groupSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(member => member.toString() !== userId.toString());
  if (this.admins.includes(userId)) {
    this.admins = this.admins.filter(admin => admin.toString() !== userId.toString());
  }
  await this.save();
};

// Method to add an admin
groupSchema.methods.addAdmin = async function(userId) {
  if (!this.admins.includes(userId)) {
    this.admins.push(userId);
    await this.save();
  }
};

// Method to remove an admin
groupSchema.methods.removeAdmin = async function(userId) {
  this.admins = this.admins.filter(admin => admin.toString() !== userId.toString());
  await this.save();
};

const Group = mongoose.model('Group', groupSchema);

module.exports = Group; 