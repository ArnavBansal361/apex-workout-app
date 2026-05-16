require('dotenv').config()

const express = require('express')
const cors = require('cors')

const PORT = Number(process.env.PORT) || 3000

const app = express()
app.use(cors())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Workout API listening on http://localhost:${PORT} (GET /health)`)
})
