/**
 * Debug Routes
 * Temporary routes for debugging database connection and data
 * 
 * WARNING: Remove these routes in production for security
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// GET /api/db-status - Check database connection and document counts
router.get('/db-status', async (req, res) => {
  try {
    const connection = mongoose.connection;
    
    // Get database connection info
    const dbName = connection.name || 'unknown';
    const host = connection.host || 'unknown';
    const port = connection.port || 'unknown';
    
    // Mask host for security (show first part only)
    const maskedHost = host ? host.split('.').slice(0, 2).join('.') + '.***' : 'unknown';
    
    // Get all collection names
    const collections = [];
    try {
      const db = connection.db;
      if (db) {
        const collectionList = await db.listCollections().toArray();
        collections.push(...collectionList.map(col => col.name));
      }
    } catch (err) {
      console.error('Error getting collections:', err);
    }
    
    // Get document counts for main models
    const counts = {};
    
    try {
      // Check if models are registered
      if (mongoose.models.User) {
        counts.users = await mongoose.models.User.countDocuments();
      } else {
        counts.users = 'Model not found';
      }
      
      if (mongoose.models.Post) {
        counts.posts = await mongoose.models.Post.countDocuments();
        // Also count by status
        counts.postsByStatus = {
          open: await mongoose.models.Post.countDocuments({ status: 'open' }),
          in_progress: await mongoose.models.Post.countDocuments({ status: 'in_progress' }),
          completed: await mongoose.models.Post.countDocuments({ status: 'completed' }),
          total: counts.posts
        };
      } else {
        counts.posts = 'Model not found';
      }
      
      if (mongoose.models.Transaction) {
        counts.transactions = await mongoose.models.Transaction.countDocuments();
      } else {
        counts.transactions = 'Model not found';
      }
      
      if (mongoose.models.Message) {
        counts.messages = await mongoose.models.Message.countDocuments();
      } else {
        counts.messages = 'Model not found';
      }
      
      if (mongoose.models.Notification) {
        counts.notifications = await mongoose.models.Notification.countDocuments();
      } else {
        counts.notifications = 'Model not found';
      }
      
      if (mongoose.models.Dispute) {
        counts.disputes = await mongoose.models.Dispute.countDocuments();
      } else {
        counts.disputes = 'Model not found';
      }
    } catch (err) {
      console.error('Error counting documents:', err);
      counts.error = err.message;
    }
    
    // Get connection state
    const connectionState = {
      readyState: connection.readyState,
      readyStateText: getReadyStateText(connection.readyState)
    };
    
    // Get MongoDB URI info (masked)
    const mongoUri = process.env.MONGODB_URI || 'not set';
    const maskedUri = mongoUri.length > 30 
      ? mongoUri.substring(0, 30) + '...' 
      : mongoUri;
    
    // Response object
    const status = {
      timestamp: new Date().toISOString(),
      connection: {
        state: connectionState,
        dbName: dbName,
        host: maskedHost,
        port: port,
        uri: maskedUri
      },
      collections: collections.sort(),
      counts: counts,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'not set',
        hasMongoUri: !!process.env.MONGODB_URI
      }
    };
    
    res.json(status);
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function to get ready state text
function getReadyStateText(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[state] || 'unknown';
}

module.exports = router;

