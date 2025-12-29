/**
 * StuLink Database Cleanup Script
 * Removes posts with missing, null, or empty titles
 * 
 * Usage: node backend/cleanup.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stulink';

console.log('🔍 Starting cleanup script...');
console.log('📡 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ Connected to MongoDB\n');

  // Define Post Schema (matching server.js)
  const PostSchema = new mongoose.Schema({}, { strict: false });
  const Post = mongoose.model('Post', PostSchema);

  try {
    // Find posts with missing, null, or empty titles OR descriptions
    const badPostsQuery = {
      $or: [
        // Bad titles
        { title: { $exists: false } },
        { title: null },
        { title: '' },
        { title: { $regex: /^\s*$/ } }, // Only whitespace
        // Bad descriptions
        { desc: { $exists: false } },
        { desc: null },
        { desc: '' },
        { desc: { $regex: /^\s*$/ } } // Only whitespace
      ]
    };

    const badPosts = await Post.find(badPostsQuery);
    console.log(`📊 Found ${badPosts.length} posts with invalid titles or descriptions`);

    if (badPosts.length > 0) {
      console.log('\n🗑️  Deleting bad posts...');
      
      // Delete all bad posts (posts with bad title OR bad desc)
      const result = await Post.deleteMany(badPostsQuery);

      console.log(`✅ Successfully deleted ${result.deletedCount} posts`);
      console.log(`\n✨ Cleanup complete! Total deleted: ${result.deletedCount} posts`);
    } else {
      console.log('✨ No bad posts found. Database is clean!');
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

