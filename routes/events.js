const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/events');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get all events
router.get('/', async (req, res) => {
  try {
    const events = await Event.find()
      .sort({ createdAt: -1 })
      .populate('organizer', 'username profilePicture');
    
    // Add user's reaction status if user is authenticated
    if (req.user) {
      events.forEach(event => {
        const userReaction = event.reactions.find(r => r.user.toString() === req.user._id.toString());
        event.userReaction = userReaction ? userReaction.type : null;
      });
    }
    
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new event (admin only)
router.post('/', [auth, admin, upload.single('image')], async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const event = new Event({
      title,
      description,
      organizer: req.user._id,
      image: req.file ? `uploads/events/${req.file.filename}` : ''
    });

    const savedEvent = await event.save();
    
    // Emit socket event for new update
    req.app.get('io').emit('newUpdate', savedEvent);
    
    res.status(201).json(savedEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// React to an event
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { reactionType } = req.body;
    if (!['like', 'dislike'].includes(reactionType)) {
      return res.status(400).json({ message: 'Invalid reaction type' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Find existing reaction
    const existingReactionIndex = event.reactions.findIndex(
      r => r.user.toString() === req.user._id.toString()
    );

    if (existingReactionIndex !== -1) {
      const existingReaction = event.reactions[existingReactionIndex];
      
      // If same reaction type, remove it
      if (existingReaction.type === reactionType) {
        event.reactions.splice(existingReactionIndex, 1);
        if (reactionType === 'like') {
          event.likes = Math.max(0, event.likes - 1);
        } else {
          event.dislikes = Math.max(0, event.dislikes - 1);
        }
      } else {
        // If different reaction type, update it
        event.reactions[existingReactionIndex].type = reactionType;
        if (reactionType === 'like') {
          event.likes += 1;
          event.dislikes = Math.max(0, event.dislikes - 1);
        } else {
          event.dislikes += 1;
          event.likes = Math.max(0, event.likes - 1);
        }
      }
    } else {
      // Add new reaction
      event.reactions.push({
        user: req.user._id,
        type: reactionType
      });
      if (reactionType === 'like') {
        event.likes += 1;
      } else {
        event.dislikes += 1;
      }
    }

    const updatedEvent = await event.save();
    
    // Emit socket event for reaction update
    req.app.get('io').emit('updateReaction', updatedEvent);
    
    res.json(updatedEvent);
  } catch (error) {
    console.error('Error reacting to event:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Update event (admin only)
router.put('/:id', [auth, admin, upload.single('image')], async (req, res) => {
  try {
    const { title, description, date, time, location, type } = req.body;

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Delete old image if new one is uploaded
    if (req.file && event.image) {
      const oldImagePath = path.join(__dirname, '..', event.image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    event.title = title;
    event.description = description;
    event.date = date;
    event.time = time;
    event.location = location;
    event.type = type;
    if (req.file) {
      event.image = `uploads/events/${req.file.filename}`;
    }

    const updatedEvent = await event.save();
    res.json(updatedEvent);
  } catch (error) {
    console.error('Error updating event:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Delete event (admin only)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Delete event image if exists
    if (event.image) {
      const imagePath = path.join(__dirname, '..', event.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await event.deleteOne();
    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get upcoming events
router.get('/upcoming', auth, async (req, res) => {
  try {
    const currentDate = new Date();
    const upcomingEvents = await Event.find({
      date: { $gte: currentDate }
    })
    .sort({ date: 1 })
    .limit(5)
    .populate('organizer', 'username profilePicture')
    .select('title date description location attendees');

    res.json(upcomingEvents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get event details
router.get('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'username profilePicture')
      .populate('attendees', 'username profilePicture');
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 