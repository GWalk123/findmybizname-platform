# Render Deployment Guide

## 🎯 5-Minute Deployment Steps

### Step 1: Prepare Repository
✅ Repository configured with `render.yaml`  
✅ Environment variables template created  
✅ Production build scripts configured  

### Step 2: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up for FREE account
3. Connect your GitHub account

### Step 3: Deploy to Render

**Option A: One-Click Deploy**
- Import this repository
- Render automatically detects `render.yaml`
- Creates web service + PostgreSQL database

**Option B: Manual Setup**
1. **New Web Service**
   - Connect GitHub repository
   - Name: `findmybizname`
   - Environment: `Node`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`

2. **PostgreSQL Database**
   - Name: `findmybizname-db`
   - Plan: `Free` (30 days)

### Step 4: Environment Variables

Set these in Render dashboard:

```
NODE_ENV=production
RAPIDAPI_KEY=your_rapidapi_key
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
WIPAY_API_KEY=your_wipay_api_key
WIPAY_DEVELOPER_ID=your_wipay_developer_id
WIPAY_BUSINESS_KEY=your_wipay_business_key
```

### Step 5: Custom Domain (Optional)
1. Add `findmybizname.com` in Render dashboard
2. Update DNS to point to Render
3. SSL certificate auto-generated

## 🔧 API Keys Setup

### RapidAPI (Domain Checking) - FREE
1. Go to [rapidapi.com](https://rapidapi.com)
2. Sign up for free account
3. Subscribe to Domainr API (free tier)
4. Copy API key to `RAPIDAPI_KEY`

### PayPal (Global Payments) - FREE Setup
1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Create developer account
3. Create new app (sandbox for testing)
4. Copy Client ID and Secret

### WiPay (Caribbean Payments) - FREE Setup
1. Contact WiPay for developer account
2. Get API credentials
3. Set sandbox mode for testing

## 🚀 Deployment Timeline

- **Repository Upload**: ✅ DONE
- **Render Account**: 2 minutes
- **Service Creation**: 3 minutes
- **Environment Variables**: 5 minutes
- **First Deployment**: 3-5 minutes
- **Custom Domain**: 10 minutes

**Total Time**: 15-20 minutes

## ✅ Verification Checklist

After deployment:

- [ ] Health check responds: `/api/health`
- [ ] Platform loads: Main page displays
- [ ] Name generator works
- [ ] Domain checker responds
- [ ] Payment forms load
- [ ] Custom domain connected (optional)

## 💰 Costs

### Free Testing (30 days)
- Web service: FREE
- PostgreSQL: FREE
- SSL certificate: FREE
- Custom domains: FREE

### Production (after 30 days)
- Web service: $7/month
- PostgreSQL: $6/month
- **Total: $13/month**

## 🆘 Troubleshooting

### Common Issues

**Build Fails**
- Check Node.js version (18+)
- Verify all dependencies installed
- Review build logs

**Database Connection**
- Verify `DATABASE_URL` is set
- Check database is running
- Review connection string format

**Environment Variables**
- All required keys set
- No typos in variable names
- Sensitive data properly escaped

### Support
- Render: Email support on all plans
- Platform: Contact via deployed app
- Emergency: Check GitHub issues

## 🎉 Success!

Your FindMyBizName platform is now live and serving 430.5M underbanked entrepreneurs globally!

Next steps:
1. Test all features
2. Set up custom domain
3. Configure payment processing
4. Launch marketing campaigns