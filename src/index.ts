import express from "express";
import cors from "cors";
import Subjectsrouter from "./routes/subjects";

const app = express();
const PORT = 8000;

app.use(express.json());

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}

));

app.use('/api/subjects', Subjectsrouter)

app.get('/', (req, res) => {
    res.send('Hello World!')
});

app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
});
