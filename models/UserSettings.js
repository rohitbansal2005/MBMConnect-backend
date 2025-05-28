const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Privacy Settings
  showOnlineStatus: {
    type: Boolean,
    default: true
  },
  showLastSeen: {
    type: Boolean,
    default: true
  },
  showProfilePicture: {
    type: Boolean,
    default: true
  },
  showEmail: {
    type: Boolean,
    default: false
  },
  showPhone: {
    type: Boolean,
    default: false
  },
  allowTagging: {
    type: Boolean,
    default: true
  },
  allowMessaging: {
    type: Boolean,
    default: true
  },
  // Blocked Users
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Content Settings
  restrictAdultContent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);