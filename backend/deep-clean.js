/**
 * StuLink Deep Clean Script
 * Removes all posts with invalid titles or descriptions from production database
 * 
 * CRITICAL: This script connects to the production database specified in .env
 * 
 * Usage: node backend/deep-clean.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stulink';

console.log('🔍 Starting deep clean script...');
console.log('📡 Connecting to MongoDB...');
console.log('⚠️  WARNING: This will delete posts from the database!');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  // CRITICAL: Log the database name to ensure we're cleaning the right DB
  console.log('\n✅ Connected to MongoDB');
  console.log('📊 Database name:', mongoose.connection.name);
  console.log('🔗 Connection URI:', MONGODB_URI.substring(0, 30) + '...');
  console.log('⚠️  Cleaning DB:', mongoose.connection.name);
  console.log('');

  // Define Post Schema (matching server.js)
  const PostSchema = new mongoose.Schema({}, { strict: false });
  const Post = mongoose.model('Post', PostSchema);

  try {
    // Find posts with missing, null, empty, or whitespace-only titles/descriptions
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

    // First, count the bad posts
    const badPostsCount = await Post.countDocuments(badPostsQuery);
    console.log(`📊 Found ${badPostsCount} posts with invalid titles or descriptions`);

    if (badPostsCount > 0) {
      // Show some examples before deleting
      const sampleBadPosts = await Post.find(badPostsQuery).limit(5).select('title desc createdAt').lean();
      console.log('\n📋 Sample of bad posts to be deleted:');
      sampleBadPosts.forEach((post, idx) => {
        console.log(`  ${idx + 1}. Title: "${post.title || '(missing)'}" | Desc: "${(post.desc || '(missing)').substring(0, 30)}..." | Created: ${post.createdAt}`);
      });

      console.log('\n🗑️  Deleting bad posts...');
      
      // Delete all bad posts
      const result = await Post.deleteMany(badPostsQuery);

      console.log(`✅ Successfully deleted ${result.deletedCount} posts`);
      
      // Verify cleanup
      const remainingBadPosts = await Post.countDocuments(badPostsQuery);
      if (remainingBadPosts === 0) {
        console.log('✨ All bad posts have been removed!');
      } else {
        console.log(`⚠️  Warning: ${remainingBadPosts} bad posts still remain`);
      }

      // Show final stats
      const totalPosts = await Post.countDocuments({});
      console.log(`\n📊 Final statistics:`);
      console.log(`   Total posts remaining: ${totalPosts}`);
      console.log(`   Bad posts deleted: ${result.deletedCount}`);
      console.log(`\n✨ Deep clean complete!`);
    } else {
      console.log('✨ No bad posts found. Database is clean!');
      
      // Show total posts count
      const totalPosts = await Post.countDocuments({});
      console.log(`📊 Total posts in database: ${totalPosts}`);
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during deep clean:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  console.error('   Make sure MONGODB_URI is set correctly in your .env file');
  process.exit(1);
});

