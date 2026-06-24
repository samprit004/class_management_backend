import express from "express";
import cors from "cors";
import Subjectsrouter from "./routes/subjects";
import ClassesRouter from "./routes/classes";
import UsersRouter from "./routes/users";
import DepartmentsRouter from "./routes/department";
import StatsRouter from "./routes/stats";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";

const app = express();
const PORT = 8000;

app.use(express.json());

if (!process.env.FRONTEND_URL) {
    throw new Error("FRONTEND_URL is not defined")
}

app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}

));

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use('/api/stats', StatsRouter)
app.use('/api/departments', DepartmentsRouter)
app.use('/api/subjects', Subjectsrouter)
app.use('/api/classes', ClassesRouter)
app.use('/api/users', UsersRouter)

app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Error handling middleware to ensure JSON responses
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
});
