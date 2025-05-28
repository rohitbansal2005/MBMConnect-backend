const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const auth = require('../middleware/auth');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Create payment intent for verification
router.post('/create-verification-payment', auth, async (req, res) => {
    try {
        const { amount = 100 } = req.body; // Default ₹100 for verification

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Convert to paise
            currency: 'inr',
            metadata: {
                userId: req.user._id.toString(),
                paymentType: 'verification'
            }
        });

        // Create payment record
        const payment = new Payment({
            user: req.user._id,
            amount: amount,
            paymentType: 'verification',
            stripePaymentId: paymentIntent.id
        });
        await payment.save();

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentId: payment._id
        });
    } catch (error) {
        console.error('Payment creation error:', error);
        res.status(500).json({ error: 'Payment creation failed' });
    }
});

// Handle successful payment
router.post('/verify-payment', auth, async (req, res) => {
    try {
        const { paymentId } = req.body;

        const payment = await Payment.findById(paymentId);
        if (!payment || payment.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Verify payment with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentId);
        
        if (paymentIntent.status === 'succeeded') {
            // Update payment status
            payment.status = 'completed';
            await payment.save();

            // Update user verification status and enable premium features
            await User.findByIdAndUpdate(req.user._id, {
                isVerified: true,
                verificationDate: new Date(),
                'premiumFeatures.customThemes': true,
                'premiumFeatures.prioritySupport': true,
                'premiumFeatures.advancedAnalytics': true,
                'premiumFeatures.customBadges': true,
                'premiumFeatures.verifiedBadge': true
            });

            res.json({ 
                message: 'Payment successful and account verified',
                premiumFeatures: {
                    customThemes: true,
                    prioritySupport: true,
                    advancedAnalytics: true,
                    customBadges: true,
                    verifiedBadge: true
                }
            });
        } else {
            res.status(400).json({ error: 'Payment not successful' });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// Get verification price
router.get('/verification-price', async (req, res) => {
    res.json({ price: 100 }); // ₹100 for verification
});

module.exports = router; 