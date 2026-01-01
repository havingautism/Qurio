/**
 * Qurio Backend Server
 * Express.js server for AI-powered backend API
 */

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}))
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
app.listen(PORT, () => {
  console.log(`🚀 Qurio backend running on http://localhost:${PORT}`)
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`)
})
