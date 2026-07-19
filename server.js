const express = require('express');
const path = require('path');
const helmet = require('helmet');

// ==========================================
// 1. SAFETY NETS (Uncaught Global Failures)
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION! Shutting down process dynamically...');
    console.error(err.name, err.message, err.stack);
    process.exit(1); // Force Render container manager to revive application layer
});

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 2. MIDDLEWARE HARDENING
// ==========================================
app.use(helmet({
    contentSecurityPolicy: false // Allows dynamic asset rendering for front-end demo templates
}));
app.use(express.json({ limit: '10kb' })); // Prevents large payload denial-of-service attempts
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. ARCHITECTURAL CORE CLASSES & WRAPPERS
// ==========================================
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Distinguishes runtime exceptions from application bugs
        Error.captureStackTrace(this, this.constructor);
    }
}

// Intercepts unexpected async rejections without requiring clunky try/catch boilerplate
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// ==========================================
// 4. PERSISTENT INVENTORY & DATA RULES
// ==========================================
const rooms = [
    { id: 101, type: 'Standard King', price: 120, image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=500' },
    { id: 102, type: 'Deluxe Double', price: 175, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=500' },
    { id: 201, type: 'Executive Suite', price: 350, image: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=500' }
];

// Operational runtime store (Mimics database transactional checks)
const bookings = [];

// Helper validation mechanics
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidDate = (dateStr) => !isNaN(Date.parse(dateStr));

// ==========================================
// 5. API ROUTING MAP
// ==========================================

// Render Live Container Health Monitor Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GET: Fetch Available Accommodations
app.get('/api/rooms', catchAsync(async (req, res, next) => {
    res.status(200).json({
        status: 'success',
        results: rooms.length,
        data: { rooms }
    });
}));

// POST: Secure, Validated Transactional Room Booking
app.post('/api/bookings', catchAsync(async (req, res, next) => {
    const { guestName, email, roomId, checkIn, checkOut } = req.body;

    // A) Input Completeness Check
    if (!guestName || !email || !roomId || !checkIn || !checkOut) {
        return next(new AppError('All tracking payload fields (guestName, email, roomId, checkIn, checkOut) are strictly required.', 400));
    }

    // B) Data Type Structural Validations
    if (!validateEmail(email)) {
        return next(new AppError('Please provide a structurally valid email address entry.', 400));
    }
    if (!isValidDate(checkIn) || !isValidDate(checkOut)) {
        return next(new AppError('Invalid formatting structural input detected for booking dates.', 400));
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkInDate < today) {
        return next(new AppError('Reservations cannot be backdated or occur in the past.', 400));
    }
    if (checkOutDate <= checkInDate) {
        return next(new AppError('Check-out timing parameters must terminate after your selected check-in window.', 400));
    }

    // C) Inventory Allocation and Overbooking Verification Checks
    const room = rooms.find(r => r.id === parseInt(roomId, 10));
    if (!room) {
        return next(new AppError('No corresponding room found mapping to that verified asset ID.', 404));
    }

    // Check for schedule collisions against active database listings
    const hasCollision = bookings.some(b => {
        if (b.roomId !== room.id) return false;
        const existingIn = new Date(b.checkIn);
        const existingOut = new Date(b.checkOut);
        return checkInDate < existingOut && checkOutDate > existingIn;
    });

    if (hasCollision) {
        return next(new AppError('Conflict detected: This exact room allocation is fully reserved across those dates.', 409));
    }

    // D) Commit Immutable Booking Ledger State
    const totalNights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const finalBill = totalNights * room.price;

    const confirmationReceipt = {
        bookingId: `BK-${Math.floor(100000 + Math.random() * 900000)}`,
        guestName: guestName.trim(),
        email: email.toLowerCase().trim(),
        roomId: room.id,
        roomType: room.type,
        checkIn,
        checkOut,
        totalNights,
        totalPaid: finalBill,
        timestamp: new Date().toISOString()
    };

    bookings.push(confirmationReceipt);

    res.status(201).json({
        status: 'success',
        message: 'Room isolation and assignment successfully committed.',
        confirmation: confirmationReceipt
    });
}));

// Fallback Rule: Intercept Undefined Path Routes
app.all('*', (req, res, next) => {
    next(new AppError(`The request path URI [${req.originalUrl}] does not resolve to an active endpoint resource here.`, 404));
});

// ==========================================
// 6. CENTRALIZED GLOBAL ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Logs severe infrastructure or application crashes inside Render console logs securely
    if (!err.isOperational) {
        console.error('💥 CRITICAL DEVSYSTEM EXCEPTION:', err);
    }

    res.status(err.statusCode).json({
        status: err.status,
        message: err.isOperational ? err.message : 'A structural processing error occurred. Our engineers are notified.'
    });
});

// ==========================================
// 7. BIND ENGINE PROCESS TO ROUTER LIFE
// ==========================================
const server = app.listen(PORT, () => {
    console.log(`🚀 Production Booking Server running on environment port: ${PORT}`);
});

process.on('unhandledRejection', (err) => {
    console.error('💥 UNHANDLED PROMISE REJECTION! Terminating runtime...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});
