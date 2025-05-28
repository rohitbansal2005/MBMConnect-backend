const express = require('express');
const app = express();
const settingsRoutes = require('./routes/settings');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const postRoutes = require('./routes/posts');

// ... other middleware like bodyParser, cors, etc.
app.use(express.json());

// Register your settings routes
app.use('/api/settings', settingsRoutes);

// Register your notification routes
app.use('/api/notifications', notificationRoutes);

// Register your report routes
app.use('/api/reports', reportRoutes);

// Register the posts route
app.use('/api/posts', postRoutes);

// ... other routes

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 