const User = require('../models/User');

async function isBlocked(requesterId, targetUserId) {
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) return false;
  return (targetUser.blockedUsers || []).some(b => b.user.toString() === requesterId.toString());
}

module.exports = isBlocked; 