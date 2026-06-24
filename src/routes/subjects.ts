import express from "express";
import { subjects, departments } from "../db/schema/app";
import { ilike, or, eq, and, count, sql, getTableColumns, desc } from "drizzle-orm";
import { db } from "../db";


const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, department, departmentId, page = 1, limit = 10 } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1)
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100)

        const offset = (currentPage - 1) * limitPerPage

        const filterCondition = [];

        if (search) {
            filterCondition.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`)
                )
            )
        }

        if (departmentId) {
            filterCondition.push(eq(subjects.departmentId, Number(departmentId)))
        } else if (department) {
            filterCondition.push(ilike(departments.name, `%${department}%`))
        }

        const whereClause = filterCondition.length > 0 ? and(...filterCondition) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)

        const total = countResult[0]?.count ?? 0;

        const subjectsList = await db.select({
            ...getTableColumns(subjects),
            department: { ...getTableColumns(departments) }
        })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)
            .orderBy(desc(subjects.createdAt))
            .offset(offset)
            .limit(limitPerPage)

        res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total,
                totalPages: Math.ceil(total / limitPerPage),
            }
        })


    } catch (e) {
        console.error(`Get /subjects error: ${e}`)
        res.status(500).json({ error: 'Failed to get subjects' })

    }
})

router.post("/", async (req, res) => {
    try {
        const [created] = await db
            .insert(subjects)
            .values({ ...req.body, departmentId: Number(req.body.departmentId) })
            .returning();

        if (!created) throw new Error("Failed to create subject");
        res.status(201).json({ data: created });
    } catch (e) {
        console.error(`POST /subjects error: ${e}`);
        res.status(500).json({ error: "Failed to create subject" });
    }
});

export default router;

