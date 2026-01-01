/**
 * Qurio Backend Server
 * Express.js server for AI-powered backend API
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load environment variables (.env then .env.local override if present)
dotenv.config()
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true })
}

const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '198.18.0.1'
const FRONTEND_URLS = process.env.FRONTEND_URLS || 'http://localhost:3000'
const ALLOWED_ORIGINS = new Set(
  FRONTEND_URLS.split(',').map(origin => origin.trim()).filter(Boolean),
)

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`CORS blocked origin: ${origin}`))
    },
    credentials: true,
  }),
)
app.use(express.json())

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Qurio backend is running' })
})

// Import routes
import titleSpaceAgentRoutes from './routes/titleSpaceAgent.js'
import titleRoutes from './routes/title.js'
import researchPlanRoutes from './routes/researchPlan.js'
import dailyTipRoutes from './routes/dailyTip.js'
import titleAndSpaceRoutes from './routes/titleAndSpace.js'
import agentForAutoRoutes from './routes/agentForAuto.js'
import relatedQuestionsRoutes from './routes/relatedQuestions.js'
import streamChatRoutes from './routes/streamChat.js'
app.use('/api', titleSpaceAgentRoutes)
app.use('/api', titleRoutes)
app.use('/api', researchPlanRoutes)
app.use('/api', dailyTipRoutes)
app.use('/api', titleAndSpaceRoutes)
app.use('/api', agentForAutoRoutes)
app.use('/api', relatedQuestionsRoutes)
app.use('/api', streamChatRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error', message: err.message })
})

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Qurio backend running on http://${HOST}:${PORT}`)
  console.log(`📡 API endpoints available at http://${HOST}:${PORT}/api`)
})
