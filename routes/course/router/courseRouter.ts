import express from 'express';
import courseController from '../controller/courseController';
const router = express.Router();

// router.post('/course', courseController.createCourse);

router.get('/course/:courseID', courseController.getCourse);
router.get('/courses', courseController.getAllCourses);
export { router as courseRouter };