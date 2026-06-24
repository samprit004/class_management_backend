import express from "express";
import { user } from "../db/schema/auth";
import { ilike, or, eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db";

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10 } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`)
                )
            );
        }

        if (role) {
            filterConditions.push(eq(user.role, String(role) as 'student' | 'teacher' | 'admin'));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause);

        const total = countResult[0]?.count ?? 0;

        const usersList = await db
            .select()
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .offset(offset)
            .limit(limitPerPage);

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total,
                totalPages: Math.ceil(total / limitPerPage),
            },
        });

    } catch (e) {
        console.error(`GET /users error: ${e}`);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

export default router;
