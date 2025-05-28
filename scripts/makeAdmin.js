require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const makeUserAdmin = async (email) => {
    try {
        // Find user by email
        const user = await User.findOne({ email });
        
        if (!user) {
            console.log('User not found');
            return;
        }

        // Update user role to admin
        user.role = 'admin';
        await user.save();

        console.log(`User ${email} is now an admin`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
};

// Get email from command line argument
const email = process.argv[2];

if (!email) {
    console.log('Please provide an email address');
    console.log('Usage: node makeAdmin.js <email>');
    process.exit(1);
}

makeUserAdmin(email); 