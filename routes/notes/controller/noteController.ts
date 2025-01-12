import { Request, Response } from "express";
import noteServices from "../services/noteServices";

//GET '/course/:id'
const getNote = async (req: Request, res: Response) => {
    try {
        const { courseID } = req.params
        if (!courseID) return res.json({ message: `courseID is required` });
        const result = await noteServices.getNote(parseInt(courseID));
        res.json(result);
    } catch (err) {
        console.log(err)
        res.json({ message: `err happened ` });
    }
}

//GET '/courses'
const getAllNotes = async (req: Request, res: Response) => {
    try {
        const result = await noteServices.getAllNotes();
        res.json(result);
    } catch (err) {
        console.log(err)
        res.json({ message: `err happened ` });
    }
};


export default {getNote, getAllNotes};