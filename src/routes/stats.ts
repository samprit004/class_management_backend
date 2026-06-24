import express from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, subjects, departments, enrollments } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { auth } from "../lib/auth.js";

async function getSessionFromReq(req: express.Request) {
    try {
        const headers = new Headers();
        if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
        return await auth.api.getSession({ headers });
    } catch {
        return null;
    }
}

const router = express.Router();

router.get("/", async (_req, res) => {
    try {
        const [
            deptCount,
            subjectCount,
            classCount,
            activeClassCount,
            studentCount,
            teacherCount,
            adminCount,
            classesByDept,
            enrollmentsByDept,
            capacityRows,
            recentClasses,
            recentSubjects,
        ] = await Promise.all([
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(departments),
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(subjects),
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(classes),
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(classes).where(eq(classes.status, "active")),
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(user).where(eq(user.role, "student")),
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(user).where(eq(user.role, "teacher")),
            db.select({ count: sql<number>`cast(count(*) as int)` }).from(user).where(eq(user.role, "admin")),

            // Classes per department
            db.select({
                name: departments.name,
                classes: sql<number>`cast(count(distinct ${classes.id}) as int)`,
            })
                .from(departments)
                .leftJoin(subjects, eq(subjects.departmentId, departments.id))
                .leftJoin(classes, eq(classes.subjectId, subjects.id))
                .groupBy(departments.id, departments.name),

            // Enrollments per department
            db.select({
                name: departments.name,
                enrolled: sql<number>`cast(count(${enrollments.studentId}) as int)`,
            })
                .from(departments)
                .leftJoin(subjects, eq(subjects.departmentId, departments.id))
                .leftJoin(classes, eq(classes.subjectId, subjects.id))
                .leftJoin(enrollments, eq(enrollments.classId, classes.id))
                .groupBy(departments.id, departments.name),

            // Per-class capacity utilisation
            db.select({
                capacity: classes.capacity,
                enrolled: sql<number>`cast(count(${enrollments.studentId}) as int)`,
            })
                .from(classes)
                .leftJoin(enrollments, eq(enrollments.classId, classes.id))
                .groupBy(classes.id, classes.capacity),

            // Recent classes
            db.select({
                id: classes.id,
                name: classes.name,
                status: classes.status,
                createdAt: classes.createdAt,
                subjectName: subjects.name,
                teacherName: user.name,
            })
                .from(classes)
                .leftJoin(subjects, eq(classes.subjectId, subjects.id))
                .leftJoin(user, eq(classes.teacherId, user.id))
                .orderBy(desc(classes.createdAt))
                .limit(5),

            // Recent subjects
            db.select({
                id: subjects.id,
                name: subjects.name,
                code: subjects.code,
                createdAt: subjects.createdAt,
                departmentName: departments.name,
            })
                .from(subjects)
                .leftJoin(departments, eq(subjects.departmentId, departments.id))
                .orderBy(desc(subjects.createdAt))
                .limit(5),
        ]);

        // Bucket capacity utilisation
        let full = 0, nearFull = 0, available = 0;
        for (const row of capacityRows) {
            const ratio = Number(row.enrolled) / Math.max(Number(row.capacity), 1);
            if (ratio >= 1) full++;
            else if (ratio >= 0.75) nearFull++;
            else available++;
        }

        const totalClasses = Number(classCount[0]?.count ?? 0);
        const totalActive = Number(activeClassCount[0]?.count ?? 0);

        res.status(200).json({
            data: {
                totals: {
                    departments: Number(deptCount[0]?.count ?? 0),
                    subjects: Number(subjectCount[0]?.count ?? 0),
                    classes: totalClasses,
                    activeClasses: totalActive,
                    students: Number(studentCount[0]?.count ?? 0),
                    teachers: Number(teacherCount[0]?.count ?? 0),
                    admins: Number(adminCount[0]?.count ?? 0),
                },
                charts: {
                    classesByDepartment: classesByDept
                        .map(d => ({ name: d.name, classes: Number(d.classes) }))
                        .sort((a, b) => b.classes - a.classes)
                        .slice(0, 8),
                    enrollmentsByDepartment: enrollmentsByDept
                        .map(d => ({ name: d.name, enrolled: Number(d.enrolled) }))
                        .sort((a, b) => b.enrolled - a.enrolled)
                        .slice(0, 8),
                    classStatus: [
                        { name: "Active", value: totalActive },
                        { name: "Inactive", value: Math.max(totalClasses - totalActive, 0) },
                    ],
                    userDistribution: [
                        { name: "Students", value: Number(studentCount[0]?.count ?? 0) },
                        { name: "Teachers", value: Number(teacherCount[0]?.count ?? 0) },
                        { name: "Admins", value: Number(adminCount[0]?.count ?? 0) },
                    ],
                    capacityStatus: [
                        { name: "Full", value: full },
                        { name: "Near Full", value: nearFull },
                        { name: "Available", value: available },
                    ],
                },
                recentActivity: {
                    classes: recentClasses,
                    subjects: recentSubjects,
                },
            },
        });
    } catch (e) {
        console.error(`GET /stats error: ${e}`);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});

// ── Teacher stats ────────────────────────────────────────────────────────────
router.get("/teacher", async (req, res) => {
    try {
        const session = await getSessionFromReq(req);
        if (!session?.user) return res.status(401).json({ error: "Not authenticated" });

        const teacherId = (session.user as any).id as string;

        const teacherClasses = await db
            .select({
                id: classes.id,
                name: classes.name,
                status: classes.status,
                capacity: classes.capacity,
                createdAt: classes.createdAt,
                subjectName: subjects.name,
                enrolled: sql<number>`cast(count(${enrollments.studentId}) as int)`,
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(enrollments, eq(enrollments.classId, classes.id))
            .where(eq(classes.teacherId, teacherId))
            .groupBy(classes.id, classes.name, classes.status, classes.capacity, classes.createdAt, subjects.name)
            .orderBy(desc(classes.createdAt));

        const totalClasses = teacherClasses.length;
        const activeClasses = teacherClasses.filter(c => c.status === "active").length;
        const totalStudents = teacherClasses.reduce((s, c) => s + Number(c.enrolled), 0);
        const uniqueSubjects = new Set(teacherClasses.map(c => c.subjectName).filter(Boolean)).size;

        res.status(200).json({
            data: {
                totals: { classes: totalClasses, activeClasses, students: totalStudents, subjects: uniqueSubjects },
                charts: {
                    enrollmentPerClass: teacherClasses
                        .map(c => ({ name: c.name, enrolled: Number(c.enrolled), capacity: Number(c.capacity) }))
                        .slice(0, 8),
                    classStatus: [
                        { name: "Active", value: activeClasses },
                        { name: "Inactive", value: Math.max(totalClasses - activeClasses, 0) },
                    ],
                },
                recentClasses: teacherClasses.slice(0, 6),
            },
        });
    } catch (e) {
        console.error(`GET /stats/teacher error: ${e}`);
        res.status(500).json({ error: "Failed to fetch teacher stats" });
    }
});

// ── Student stats ─────────────────────────────────────────────────────────────
router.get("/student", async (req, res) => {
    try {
        const session = await getSessionFromReq(req);
        if (!session?.user) return res.status(401).json({ error: "Not authenticated" });

        const studentId = (session.user as any).id as string;

        const [enrolledClasses, totalAvailableRow] = await Promise.all([
            db
                .select({
                    id: classes.id,
                    name: classes.name,
                    status: classes.status,
                    capacity: classes.capacity,
                    schedules: classes.schedules,
                    subjectName: subjects.name,
                    teacherName: user.name,
                    enrolledCount: sql<number>`cast((
                        select count(*) from ${enrollments} where ${enrollments.classId} = ${classes.id}
                    ) as int)`,
                })
                .from(enrollments)
                .innerJoin(classes, eq(enrollments.classId, classes.id))
                .leftJoin(subjects, eq(classes.subjectId, subjects.id))
                .leftJoin(user, eq(classes.teacherId, user.id))
                .where(eq(enrollments.studentId, studentId))
                .orderBy(desc(classes.createdAt)),

            db
                .select({ count: sql<number>`cast(count(*) as int)` })
                .from(classes)
                .where(eq(classes.status, "active")),
        ]);

        const activeEnrolled = enrolledClasses.filter(c => c.status === "active").length;
        const uniqueTeachers = new Set(enrolledClasses.map(c => c.teacherName).filter(Boolean)).size;

        res.status(200).json({
            data: {
                totals: {
                    enrolled: enrolledClasses.length,
                    activeEnrolled,
                    availableClasses: Number(totalAvailableRow[0]?.count ?? 0),
                    teachers: uniqueTeachers,
                },
                charts: {
                    enrollmentStatus: [
                        { name: "Active", value: activeEnrolled },
                        { name: "Inactive", value: Math.max(enrolledClasses.length - activeEnrolled, 0) },
                    ],
                    classCapacity: enrolledClasses
                        .map(c => ({
                            name: c.name,
                            enrolled: Number(c.enrolledCount),
                            capacity: Number(c.capacity),
                        }))
                        .slice(0, 8),
                },
                enrolledClasses: enrolledClasses.slice(0, 6),
            },
        });
    } catch (e) {
        console.error(`GET /stats/student error: ${e}`);
        res.status(500).json({ error: "Failed to fetch student stats" });
    }
});

export default router;
