# StuLink Deployment Guide - GitHub & Vercel

This guide will walk you through deploying your StuLink project to GitHub and Vercel with MongoDB Atlas.

---

## 📋 Prerequisites

1. **GitHub Account** - [github.com](https://github.com)
2. **Vercel Account** - [vercel.com](https://vercel.com) (free tier works)
3. **MongoDB Atlas Account** - [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) (free tier available)

---

## 🗄️ Step 1: Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up/login
2. Create a new cluster (choose FREE tier)
3. Wait for cluster to deploy (~3-5 minutes)
4. Click **"Connect"** → **"Connect your application"**
5. Copy the connection string (looks like: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`)
6. Replace `<password>` with your database user password
7. Add database name at the end: `...mongodb.net/stulink?retryWrites=true&w=majority`
8. **Save this connection string** - you'll need it for Vercel!

---

## 📦 Step 2: Initialize Git & Push to GitHub

Open your terminal in the project root directory and run these commands:

```bash
# Initialize Git repository
git init

# Add all files (except those in .gitignore)
git add .

# Create your first commit
git commit -m "Initial commit: StuLink project ready for deployment"

# Create a new repository on GitHub (via web interface), then:
# Replace YOUR_USERNAME and YOUR_REPO_NAME with your actual values
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Note:** If you haven't created the GitHub repo yet:
1. Go to [github.com/new](https://github.com/new)
2. Name your repository (e.g., `stulink`)
3. Don't initialize with README (you already have files)
4. Click "Create repository"
5. Copy the repository URL and use it in the `git remote add origin` command above

---

## 🚀 Step 3: Deploy to Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New Project"**
3. Import your GitHub repository:
   - Click **"Import Git Repository"**
   - Select your StuLink repository
   - Click **"Import"**
4. Configure project:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (leave as default)
   - **Build Command:** Leave empty (or `echo "No build needed"`)
   - **Output Directory:** Leave empty
5. **Add Environment Variables:**
   - Click **"Environment Variables"**
   - Add these variables:

   | Name | Value |
   |------|-------|
   | `MONGODB_URI` | Your MongoDB Atlas connection string (from Step 1) |
   | `JWT_SECRET` | Generate a random secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NODE_ENV` | `production` |

6. Click **"Deploy"**
7. Wait for deployment to complete (~2-3 minutes)
8. Your site will be live at `https://your-project-name.vercel.app`!

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No
# - Project name? (press Enter for default)
# - Directory? (press Enter for current directory)
# - Override settings? No

# Add environment variables
vercel env add MONGODB_URI
# Paste your MongoDB Atlas connection string when prompted

vercel env add JWT_SECRET
# Paste your generated JWT secret when prompted

vercel env add NODE_ENV
# Enter: production

# Deploy to production
vercel --prod
```

---

## 🔧 Step 4: Configure MongoDB Atlas Network Access

1. Go back to MongoDB Atlas dashboard
2. Click **"Network Access"** in the left sidebar
3. Click **"Add IP Address"**
4. Click **"Allow Access from Anywhere"** (or add Vercel's IP ranges)
5. Click **"Confirm"**

**Note:** For production, you should restrict IPs, but for now "Allow from Anywhere" works for testing.

---

## ✅ Step 5: Verify Deployment

1. Visit your Vercel deployment URL (e.g., `https://your-project.vercel.app`)
2. Test the application:
   - Register a new user
   - Create a post
   - Check if data is saved to MongoDB Atlas
3. Check MongoDB Atlas:
   - Go to **"Collections"** in your cluster
   - You should see your database `stulink` with collections like `users`, `posts`, etc.

---

## 🔄 Step 6: Update Frontend API URL (If Needed)

The `api.js` file has been updated to automatically detect the environment. It will:
- Use `/api` (relative) in production (Vercel)
- Use `http://localhost:3000/api` in development

**No manual changes needed!** The code handles this automatically.

---

## 📝 Environment Variables Summary

Make sure these are set in Vercel:

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/stulink?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret key for JWT tokens | `a1b2c3d4e5f6...` (32+ characters) |
| `NODE_ENV` | Environment mode | `production` |

---

## 🐛 Troubleshooting

### Issue: "MongoDB connection error"
- **Solution:** Check that `MONGODB_URI` is correctly set in Vercel environment variables
- Make sure MongoDB Atlas network access allows connections from anywhere

### Issue: "API calls failing"
- **Solution:** Check browser console for errors
- Verify that `api.js` is using relative URLs (`/api`) in production
- Check Vercel function logs: Dashboard → Your Project → Functions → View Logs

### Issue: "Build failed"
- **Solution:** Make sure `package.json` has the correct `engines` field
- Check that all dependencies are listed in `package.json`

### Issue: "Static files not loading"
- **Solution:** Verify `vercel.json` routes are correct
- Check that frontend files (index.html, style.css, app.js, api.js) are in the root directory

---

## 🔐 Security Notes

1. **JWT_SECRET:** Generate a strong random secret (32+ characters)
2. **MongoDB Password:** Use a strong password for your database user
3. **Environment Variables:** Never commit `.env` files to GitHub (already in `.gitignore`)

---

## 📚 Next Steps

- Set up custom domain in Vercel
- Configure MongoDB Atlas IP whitelist for production
- Set up monitoring and error tracking
- Configure automated deployments (already enabled with GitHub integration)

---

## 🎉 You're Live!

Your StuLink application is now deployed and accessible worldwide!

**Deployment URL:** `https://your-project-name.vercel.app`

---

## Quick Reference Commands

```bash
# Local development
npm install
npm run dev

# Git workflow
git add .
git commit -m "Your commit message"
git push origin main

# Vercel CLI (if using CLI)
vercel --prod
```

---

**Need Help?** Check Vercel logs or MongoDB Atlas connection issues in the dashboard.

