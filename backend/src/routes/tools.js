import express from 'express'
import { listTools } from '../services/toolsService.js'

const router = express.Router()

/**
 * GET /api/tools
 * Return available local tools for agent configuration.
 */
router.get('/tools', (req, res) => {
  res.json({ tools: listTools() })
})

export default router
