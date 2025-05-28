const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Get all reports (admin only)
router.get('/', [auth, admin], async (req, res) => {
    try {
        console.log('Fetching reports...');
        const reports = await Report.find()
            .populate('reporter', 'username email')
            .populate({
                path: 'reportedItem',
                select: 'username email content title', // Adjust fields based on itemType
                options: { lean: true }
            })
            .populate('resolvedBy', 'username email')
            .sort({ createdAt: -1 });

        console.log(`Found ${reports.length} reports`);
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ 
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Create a new report
router.post('/', auth, async (req, res) => {
    try {
        const { reportedItem, itemType, reason, description } = req.body;

        if (!reportedItem || !itemType || !reason || !description) {
            return res.status(400).json({ 
                message: 'Missing required fields' 
            });
        }

        const report = new Report({
            reporter: req.user.userId,
            reportedItem,
            itemType,
            reason,
            description
        });

        await report.save();
        res.status(201).json(report);
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ 
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update report status (admin only)
router.patch('/:id', [auth, admin], async (req, res) => {
    try {
        const { status, adminNotes } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status is required' });
        }

        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        report.status = status;
        if (adminNotes) report.adminNotes = adminNotes;
        report.resolvedBy = req.user._id;
        report.resolvedAt = new Date();

        await report.save();
        res.json(report);
    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({ 
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get report by ID
router.get('/:id', [auth, admin], async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('reporter', 'username email')
            .populate({
                path: 'reportedItem',
                select: 'username email content title', // Adjust fields based on itemType
                options: { lean: true }
            })
            .populate('resolvedBy', 'username email');

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        res.json(report);
    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({ 
            message: 'Server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router; 