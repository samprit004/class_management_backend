import express from "express";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { auth } from "../lib/auth.js";

const router = express.Router();

type AuthSession = {
    user: { id: string; name: string; email: string; role?: string } | null;
} | null;

async function getSession(req: express.Request): Promise<AuthSession> {
    try {
        const headers = new Headers();
        if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
        if (req.headers.authorization) headers.set("authorization", String(req.headers.authorization));
        const session = await auth.api.getSession({ headers });
        return session as AuthSession;
    } catch {
        return null;
    }
}

// GET /api/enrollments — current student's enrolled classes
router.get("/", async (req, res) => {
    try {
        const session = await getSession(req);
        if (!session?.user) return res.status(401).json({ error: "Not authenticated" });
        if (session.user.role !== "student" && session.user.role !== "admin") {
            return res.status(403).json({ error: "Only students can view enrollments" });
        }

        const { page = 1, limit = 20 } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 20), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const studentId = session.user.id;

        const [countRow] = await db
            .select({ count: sql<number>`cast(count(*) as int)` })
            .from(enrollments)
            .where(eq(enrollments.studentId, studentId));

        const enrolled = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                department: { ...getTableColumns(departments) },
                teacher: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    role: user.role,
                },
            })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(eq(enrollments.studentId, studentId))
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: enrolled,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: Number(countRow?.count ?? 0),
                totalPages: Math.ceil(Number(countRow?.count ?? 0) / limitPerPage),
            },
        });
    } catch (e) {
        console.error(`GET /enrollments error: ${e}`);
        res.status(500).json({ error: "Failed to get enrollments" });
    }
});

// GET /api/enrollments/check/:classId — enrollment + role info for current user
router.get("/check/:classId", async (req, res) => {
    try {
        const session = await getSession(req);
        if (!session?.user) return res.status(200).json({ enrolled: false, role: null });

        const classId = Number(req.params.classId);
        if (!Number.isFinite(classId)) return res.status(200).json({ enrolled: false, role: session.user.role });

        const [existing] = await db
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.studentId, session.user.id), eq(enrollments.classId, classId)));

        res.status(200).json({ enrolled: !!existing, role: session.user.role });
    } catch (e) {
        res.status(200).json({ enrolled: false, role: null });
    }
});

// POST /api/enrollments/join — join a class by classId or inviteCode
router.post("/join", async (req, res) => {
    try {
        const session = await getSession(req);
        if (!session?.user) return res.status(401).json({ error: "Not authenticated" });
        if (session.user.role !== "student") {
            return res.status(403).json({ error: "Only students can join classes" });
        }

        const { classId, inviteCode } = req.body;

        let targetClass: typeof classes.$inferSelect | undefined;

        if (classId) {
            const [cls] = await db.select().from(classes).where(eq(classes.id, Number(classId)));
            targetClass = cls;
        } else if (inviteCode) {
            const [cls] = await db.select().from(classes).where(eq(classes.inviteCode, String(inviteCode)));
            targetClass = cls;
        } else {
            return res.status(400).json({ error: "Provide classId or inviteCode" });
        }

        if (!targetClass) return res.status(404).json({ error: "Class not found" });
        if (targetClass.status !== "active") return res.status(400).json({ error: "This class is not currently active" });

        const [{ count }] = await db
            .select({ count: sql<number>`cast(count(*) as int)` })
            .from(enrollments)
            .where(eq(enrollments.classId, targetClass.id));

        if (Number(count) >= targetClass.capacity) {
            return res.status(400).json({ error: "This class is at full capacity" });
        }

        const [existing] = await db
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.studentId, session.user.id), eq(enrollments.classId, targetClass.id)));

        if (existing) return res.status(400).json({ error: "Already enrolled in this class" });

        await db.insert(enrollments).values({ studentId: session.user.id, classId: targetClass.id });

        res.status(201).json({ data: { message: "Enrolled successfully", classId: targetClass.id } });
    } catch (e) {
        console.error(`POST /enrollments/join error: ${e}`);
        res.status(500).json({ error: "Failed to join class" });
    }
});

// DELETE /api/enrollments/:classId — leave a class
router.delete("/:classId", async (req, res) => {
    try {
        const session = await getSession(req);
        if (!session?.user) return res.status(401).json({ error: "Not authenticated" });
        if (session.user.role !== "student") {
            return res.status(403).json({ error: "Only students can leave classes" });
        }

        const classId = Number(req.params.classId);
        if (!Number.isFinite(classId)) return res.status(400).json({ error: "Invalid class ID" });

        await db
            .delete(enrollments)
            .where(and(eq(enrollments.studentId, session.user.id), eq(enrollments.classId, classId)));

        res.status(200).json({ data: { message: "Left class successfully" } });
    } catch (e) {
        console.error(`DELETE /enrollments/:classId error: ${e}`);
        res.status(500).json({ error: "Failed to leave class" });
    }
});

export default router;
