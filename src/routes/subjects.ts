import express from "express";
import { subjects, departments } from "../db/schema/app";
import { ilike, or, eq, and, count, sql, getTableColumns, desc } from "drizzle-orm";
import { db } from "../db";


const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { search, department, page = 1, limit = 10 } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1)
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100)

        const offset = (currentPage - 1) * limitPerPage

        const filterCondition = [];
        // if search query exists, filter by subject name or subject code
        if (search) {
            filterCondition.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`)
                )
            )
        }

        // if department filter exists, match department name
        if (department) {
            filterCondition.push(
                ilike(departments.name, `%${department}%`)
            )
        }

        // combine all filters using AND if any exists
        const whereClause = filterCondition.length > 0 ? and(...filterCondition) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)

        const totalCount = countResult[0]?.count ?? 0;

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
                totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
                currentPage,
                limitPerPage

            }
        })


    } catch (e) {
        console.error(`Get /subjects error: ${e}`)
        res.status(500).json({ error: 'Failed to get subjects' })

    }
})

export default router;

