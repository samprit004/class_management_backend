import express from "express";
import cors from "cors";
import Subjectsrouter from "./routes/subjects";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";

const app = express();
const PORT = 8000;

app.use(express.json());

if (!process.env.FRONTEND_URL) {
    throw new Error("FRONTEND_URL is not defined")
}

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}

));

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use('/api/subjects', Subjectsrouter)

app.get('/', (req, res) => {
    res.send('Hello World!')
});

app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
});
