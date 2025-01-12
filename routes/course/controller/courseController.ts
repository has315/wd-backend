import { Request, Response } from "express";
import courseServices from "../services/courseServices";

//GET '/course/:id'
const getCourse = async (req: Request, res: Response) => {
    try {
        const { courseID } = req.params
        if (!courseID) return res.json({ message: `courseID is required` });
        const result = await courseServices.getCourse(parseInt(courseID));
        res.json(result);
    } catch (err) {
        console.log(err)
        res.json({ message: `err happened ` });
    }
}

//GET '/products'
const getAllCourses = async (req: Request, res: Response) => {
    try {
        const result = await courseServices.getAllCourses();
        res.json(result);
    } catch (err) {
        console.log(err)
        res.json({ message: `err happened ` });
    }
};



export default {getCourse, getAllCourses};