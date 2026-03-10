const app = require("express")()
const bodyParser = require("body-parser")
const mangaRouter = require("./routes/mangaRouter")
const mangaListRouter = require("./routes/mangaListRouter")
const mangaSearch = require("./routes/mangaSearch")

app.use(bodyParser.json())
require('dotenv').config()

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use("/api/manga", mangaRouter)
app.use("/api/mangaList", mangaListRouter)
app.use("/api/search", mangaSearch)

app.listen(process.env.PORT, ()=>{
  console.log(`Server Start On Port ${process.env.PORT} 🚀✨ `)
})
