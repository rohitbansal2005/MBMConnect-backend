const socketIO = require('socket.io');
const User = require('./models/User');
const UserSettings = require('./models/UserSettings');
const Message = require('./models/Message');
const Event = require('./models/Event');

let io;

const initializeSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Replace the single socket ID map with a map of userId -> Set of socketIds
  const onlineUsersMap = new Map(); // userId -> Set of socketIds

  // Function to emit online users based on privacy settings
  const emitOnlineUsers = async () => {
    try {
      // Get all online user IDs from the map
      const onlineUserIds = Array.from(onlineUsersMap.keys());
      // Fetch users who are online AND have showOnlineStatus enabled in User model
      const users = await User.find({
        _id: { $in: onlineUserIds },
        showOnlineStatus: true
      }).select('_id username profilePicture avatar isVerified isPremium');
      const usersToShowAsOnline = users.map(user => ({
        id: user._id.toString(),
        username: user.username,
        profilePicture: user.profilePicture,
        avatar: user.avatar,
        isVerified: user.isVerified,
        isPremium: user.isPremium
      }));
      io.emit('onlineUsers', usersToShowAsOnline);
      console.log('Emitting online users:', usersToShowAsOnline);
    } catch (error) {
      console.error('Error emitting online users:', error);
    }
  };

  io.on('connection', async (socket) => {
    console.log('New client connected:', socket.id);

    // Authenticate and store user ID
    // Assuming auth middleware or similar runs before this and attaches user to socket
    // For this example, we'll assume userId is passed on login event

    // Join user's room for private messages (moved outside userLogin)
    socket.on('joinUserRoom', (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined their room`);
    });

    // Handle new messages
    socket.on('sendMessage', async (data) => {
      try {
        const { recipientId, text } = data;

        // Ensure sender is set from authenticated user on socket
        if (!socket.userId) {
          console.error('Message sender not authenticated');
          return;
        }
        
        // Create new message
        const newMessage = new Message({
          sender: socket.userId,
          recipient: recipientId,
          text: text
        });

        await newMessage.save();

        // Populate sender and recipient details
        await newMessage.populate('sender', 'username profilePicture avatar');
        await newMessage.populate('recipient', 'username profilePicture avatar');

        // Format message with proper image URLs
        const formattedMessage = newMessage.toObject();
        
        // Format sender's image URLs
        if (formattedMessage.sender) {
          formattedMessage.sender.profilePicture = formattedMessage.sender.profilePicture
            ? (formattedMessage.sender.profilePicture.startsWith('http')
                ? formattedMessage.sender.profilePicture
                : `http://localhost:5000/${formattedMessage.sender.profilePicture}`)
            : null;
          formattedMessage.sender.avatar = formattedMessage.sender.avatar
            ? (formattedMessage.sender.avatar.startsWith('http')
                ? formattedMessage.sender.avatar
                : `http://localhost:5000/${formattedMessage.sender.avatar}`)
            : null;
        }

        // Format recipient's image URLs
        if (formattedMessage.recipient) {
          formattedMessage.recipient.profilePicture = formattedMessage.recipient.profilePicture
            ? (formattedMessage.recipient.profilePicture.startsWith('http')
                ? formattedMessage.recipient.profilePicture
                : `http://localhost:5000/${formattedMessage.recipient.profilePicture}`)
            : null;
          formattedMessage.recipient.avatar = formattedMessage.recipient.avatar
            ? (formattedMessage.recipient.avatar.startsWith('http')
                ? formattedMessage.recipient.avatar
                : `http://localhost:5000/${formattedMessage.recipient.avatar}`)
            : null;
        }

        // Emit to recipient's room
        io.to(recipientId).emit('newMessage', formattedMessage);
        
        // Also emit to sender's room for confirmation
        io.to(socket.userId).emit('messageSent', formattedMessage);
      } catch (error) {
        console.error('Error in sendMessage:', error);
        socket.emit('messageError', { message: 'Failed to send message' });
      }
    });

    // Handle updates
    socket.on('createUpdate', async (data) => {
      try {
        if (!socket.userId) {
          console.error('Update creator not authenticated');
          return;
        }

        const { title, description } = data;
        const newUpdate = new Event({
          title,
          description,
          organizer: socket.userId
        });

        await newUpdate.save();
        await newUpdate.populate('organizer', 'username profilePicture');

        io.emit('newUpdate', newUpdate);
      } catch (error) {
        console.error('Error in createUpdate:', error);
        socket.emit('updateError', { message: 'Failed to create update' });
      }
    });

    socket.on('updateReaction', async (data) => {
      try {
        if (!socket.userId) {
          console.error('User not authenticated for reaction');
          return;
        }

        const { updateId, reactionType } = data;
        const update = await Event.findById(updateId);
        
        if (!update) {
          socket.emit('updateError', { message: 'Update not found' });
          return;
        }

        const existingReactionIndex = update.reactions.findIndex(
          r => r.user.toString() === socket.userId
        );

        if (existingReactionIndex !== -1) {
          const existingReaction = update.reactions[existingReactionIndex];
          
          if (existingReaction.type === reactionType) {
            update.reactions.splice(existingReactionIndex, 1);
            if (reactionType === 'like') {
              update.likes = Math.max(0, update.likes - 1);
            } else {
              update.dislikes = Math.max(0, update.dislikes - 1);
            }
          } else {
            update.reactions[existingReactionIndex].type = reactionType;
            if (reactionType === 'like') {
              update.likes += 1;
              update.dislikes = Math.max(0, update.dislikes - 1);
            } else {
              update.dislikes += 1;
              update.likes = Math.max(0, update.likes - 1);
            }
          }
        } else {
          update.reactions.push({
            user: socket.userId,
            type: reactionType
          });
          if (reactionType === 'like') {
            update.likes += 1;
          } else {
            update.dislikes += 1;
          }
        }

        await update.save();
        io.emit('updateReaction', update);
      } catch (error) {
        console.error('Error in updateReaction:', error);
        socket.emit('updateError', { message: 'Failed to react to update' });
      }
    });

    socket.on('userLogin', async (userId) => {
      try {
        console.log('User login attempt:', userId);
        socket.userId = userId; // Store userId in socket for message handling
        
        // Add socket.id to the Set for this user
        if (!onlineUsersMap.has(userId)) {
          onlineUsersMap.set(userId, new Set());
        }
        onlineUsersMap.get(userId).add(socket.id);
        
        // Mark user as online in DB
        await User.findByIdAndUpdate(userId, { 
          isOnline: true,
          lastSeen: new Date()
        });
        
        console.log('User marked as online:', userId);
        
        // Emit updated online users list respecting privacy settings
        emitOnlineUsers();

      } catch (error) {
        console.error('Error in userLogin:', error);
      }
    });

    // Handle userLogout (if you have a separate logout event)
    // This might be redundant if disconnect handles most cases
    socket.on('userLogout', async (userId) => {
       try {
        console.log('User logout:', userId);
        onlineUsersMap.delete(userId);
        await User.findByIdAndUpdate(userId, { 
          isOnline: false,
          lastSeen: new Date()
        });
        // Emit updated online users list
        emitOnlineUsers();
       } catch(error) {
         console.error('Error in userLogout:', error);
       }
    });

    socket.on('disconnect', async () => {
      try {
        console.log('Client disconnected:', socket.id);
        
        // Find the user ID associated with this socket ID
        let disconnectedUserId = null;
        for (const [userId, socketSet] of onlineUsersMap.entries()) {
          if (socketSet.has(socket.id)) {
            socketSet.delete(socket.id);
            if (socketSet.size === 0) {
              onlineUsersMap.delete(userId);
              disconnectedUserId = userId;
            }
            break;
          }
        }

        if (disconnectedUserId) {
          // Mark user as offline in DB
          await User.findByIdAndUpdate(disconnectedUserId, { 
            isOnline: false,
            lastSeen: new Date()
          });
          
          console.log('User marked as offline:', disconnectedUserId);
          
          // Emit updated online users list
          emitOnlineUsers();
        }
      } catch (error) {
        console.error('Error in disconnect:', error);
      }
    });

    // Handle settings changes related to online status visibility
    // Assuming a socket event for settings updates, e.g., 'updateSettings'
    socket.on('updateSettings', async (updatedSettings) => {
      try {
        if (!socket.userId) {
           console.error('User not authenticated for settings update');
           return;
        }
        // Assuming updatedSettings contains showOnlineStatus and showLastSeen
        // Update settings in DB (this should ideally be done via your settings PUT API route)
        // For demonstration, we'll directly update here, but calling the API is better practice
        const settings = await UserSettings.findOneAndUpdate(
            { user: socket.userId },
            { $set: updatedSettings },
            { new: true, upsert: true }
        );

        console.log('User settings updated:', settings);

        // If online status visibility changed, re-emit the online users list
        if (typeof updatedSettings.showOnlineStatus === 'boolean') {
           emitOnlineUsers();
        }

      } catch (error) {
        console.error('Error updating settings via socket:', error);
      }
    });


  });

  return io;
};

module.exports = {
  initializeSocket,
  getIO: () => io
}; 