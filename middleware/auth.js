const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        console.log('=== Auth Middleware ===');
        console.log('Request headers:', req.headers);
        
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            console.log('No Authorization header found');
            return res.status(401).json({ message: 'No authentication token, access denied' });
        }

        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            console.log('No token found in Authorization header');
            return res.status(401).json({ message: 'No authentication token, access denied' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
            console.log('Token decoded:', decoded);
            
            // Ensure _id exists in the token
            if (!decoded._id) {
                console.error('Token missing _id:', decoded);
                return res.status(401).json({ 
                    message: 'Invalid token format: missing _id',
                    error: 'Token verification failed'
                });
            }

            // Get user from database
            const user = await User.findById(decoded._id);
            if (!user) {
                console.error('User not found:', decoded._id);
                return res.status(401).json({ 
                    message: 'User not found',
                    error: 'Token verification failed'
                });
            }

            // Set user info in request
            req.user = {
                _id: user._id,
                userId: user._id,
                role: user.role || 'user'
            };
            console.log('Auth successful, user info set:', req.user);
            next();
        } catch (verifyError) {
            console.error('Token verification failed:', {
                name: verifyError.name,
                message: verifyError.message,
                stack: verifyError.stack
            });
            return res.status(401).json({ 
                message: 'Token verification failed, authorization denied',
                error: verifyError.message
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            message: 'Server error in auth middleware',
            error: error.message
        });
    }
};

module.exports = auth; 