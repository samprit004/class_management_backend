import express from "express";
import { and, desc, ilike, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { departments } from "../db/schema/app.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(ilike(departments.name, `%${search}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(departments)
            .where(whereClause);

        const total = countResult[0]?.count ?? 0;

        const departmentsList = await db
            .select()
            .from(departments)
            .where(whereClause)
            .orderBy(desc(departments.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: departmentsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total,
                totalPages: Math.ceil(total / limitPerPage),
            },
        });
    } catch (e) {
        console.error(`GET /departments error: ${e}`);
        res.status(500).json({ error: "Failed to get departments" });
    }
});

router.post("/", async (req, res) => {
    try {
        const [created] = await db
            .insert(departments)
            .values(req.body)
            .returning();

        if (!created) throw new Error("Failed to create department");
        res.status(201).json({ data: created });
    } catch (e) {
        console.error(`POST /departments error: ${e}`);
        res.status(500).json({ error: "Failed to create department" });
    }
});

export default router;
