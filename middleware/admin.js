const User = require('../models/User');

const admin = (req, res, next) => {
    try {
        console.log('=== Admin Middleware ===');
        console.log('User from request:', req.user);

        if (!req.user || req.user.role !== 'admin') {
            console.log('Access denied: User is not an admin');
            return res.status(403).json({ 
                message: 'Access denied. Admin privileges required.' 
            });
        }
        
        console.log('Admin access granted');
        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = admin; 