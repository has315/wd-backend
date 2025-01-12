import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "../auth";
import { db } from "@db";
import { notes, courses, courseNotes, type User } from "@db/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import multer from "multer";
import { promises as fs } from "fs";
import PDFParser from "pdf-parse/lib/pdf-parse.js";
import { parse as parseCSV } from "csv-parse/sync";
import { analyzeNotesForCourse } from "../services/openai";
import { sendTestEmail } from "../services/email";

// Configure multer for file uploads with strict file type checking
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir("uploads", { recursive: true });
      cb(null, "uploads/");
    } catch (err) {
      console.error("Error creating uploads directory:", err);
      cb(err as Error, "uploads/");
    }
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = ["application/pdf", "text/csv", "text/plain"];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types are: ${allowedMimes.join(", ")}`,
      ),
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

async function validatePDFContent(content: string): Promise<string> {
  if (!content || content.length === 0) {
    throw new Error("PDF content is empty");
  }

  // Basic content validation
  if (content.length < 10) {
    throw new Error("PDF content is too short to be valid");
  }

  console.log("Raw content length:", content.length);
  console.log("Content preview:", content.substring(0, 200));

  // Remove problematic characters and normalize
  const cleanedContent = content
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "") // Remove control characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, "") // Remove Unicode replacement characters
    .replace(/[^\x20-\x7E\n\r\t]/g, " ") // Replace non-printable characters with spaces
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  if (!cleanedContent || cleanedContent.length === 0) {
    throw new Error("PDF content is invalid or contains no readable text");
  }

  // Validate that the content contains actual text
  if (!/[a-zA-Z]/.test(cleanedContent)) {
    throw new Error("PDF content contains no readable text");
  }

  console.log("Cleaned content length:", cleanedContent.length);
  return cleanedContent;
}

async function processPDF(filePath: string): Promise<string> {
  try {
    console.log("Starting PDF processing for:", filePath);
    const dataBuffer = await fs.readFile(filePath);

    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error("PDF file is empty");
    }

    console.log("PDF file read, size:", dataBuffer.length, "bytes");

    const options = {
      max: 0, // Parse all pages
      pagerender: undefined,
      text: true,
      disableCombineTextItems: false,
      normalizeWhitespace: false, // Changed to false to preserve spacing
    };

    const pdfData = await PDFParser(dataBuffer, options);

    if (!pdfData || !pdfData.text) {
      throw new Error("PDF parsing failed to extract any text");
    }

    // Log detailed stats about the extracted content
    const rawText = pdfData.text;
    const stats = {
      rawLength: rawText.length,
      rawWordCount: rawText.split(/\s+/).filter(Boolean).length,
      pageCount: pdfData.numpages || 1,
      byteLength: dataBuffer.length,
    };

    console.log("PDF parsing stats:", stats);
    console.log("First 500 chars:", rawText.substring(0, 500));
    console.log("Last 500 chars:", rawText.substring(rawText.length - 500));

    // Preserve the content with minimal processing
    const content = rawText
      .replace(/\u0000/g, "") // Remove null bytes
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/^\s*taskName\s*$/gim, "") // Remove standalone taskName lines
      .replace(/\n{4,}/g, "\n\n\n") // Normalize excessive newlines but preserve structure
      .trim();

    const processedStats = {
      processedLength: content.length,
      processedWordCount: content.split(/\s+/).filter(Boolean).length,
      linesCount: content.split("\n").length,
      contentPreview: content.substring(0, 200),
    };

    console.log("Processed content stats:", processedStats);

    if (processedStats.processedWordCount < stats.rawWordCount * 0.95) {
      console.warn("Warning: Content loss detected, reverting to raw text");
      return rawText.trim();
    }

    return content;
  } catch (error: any) {
    console.error("PDF processing error:", {
      error: error.message,
      stack: error.stack,
      filePath,
    });
    throw new Error(`Could not process PDF: ${error.message}`);
  }
}

async function processCSV(filePath: string): Promise<string> {
  try {
    console.log("Starting CSV processing for:", filePath);
    const fileContent = await fs.readFile(filePath, "utf-8");
    console.log("CSV file read, size:", fileContent.length, "bytes");

    // Parse CSV content
    const records = parseCSV(fileContent, {
      skip_empty_lines: true,
      trim: true,
    });

    // Convert CSV records to string content
    const content = records
      .map((record: any) => record.join(" "))
      .join("\n")
      .trim();

    if (!content) {
      throw new Error("CSV processing resulted in empty content");
    }

    console.log("CSV content processed, length:", content.length);
    return content;
  } catch (error) {
    console.error("CSV processing error:", error);
    throw new Error("Failed to process CSV file");
  }
}

async function processFile(file: Express.Multer.File): Promise<string> {
  console.log(`Processing file: ${file.originalname}, type: ${file.mimetype}`);

  try {
    let content: string;

    switch (file.mimetype) {
      case "text/csv":
        content = await processCSV(file.path);
        break;
      case "application/pdf":
        content = await processPDF(file.path);
        break;
      case "text/plain":
        content = (await fs.readFile(file.path, "utf-8")).trim();
        break;
      default:
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    if (!content || content.length === 0) {
      throw new Error("No content could be extracted from the file");
    }

    console.log(
      `Successfully processed ${file.originalname}, content length: ${content.length}`,
    );
    return content;
  } catch (error: any) {
    console.error(`Error processing ${file.originalname}:`, error);
    throw error;
  }
}

export function registerRoutes(app: Express): Server {
  // Setup authentication first
  setupAuth(app);

  // API request logging middleware
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    }
    next();
  });

  // Authentication check middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  };

  // Notes endpoints
  app.post("/api/notes/upload", upload.single("file"), async (req, res) => {
    let filePath: string | undefined;

    try {
      if (!req.isAuthenticated()) {
        return res.status(401).send("Not authenticated");
      }

      const file = req.file;
      if (!file) {
        return res.status(400).send("No file uploaded");
      }

      filePath = file.path;
      console.log("Processing file upload for user:", req.user?.id);

      try {
        const content = await processFile(file);

        // Process tags if provided
        const tags = req.body.tags
          ? req.body.tags.split(",").map((tag: string) => tag.trim())
          : [];

        const user = req.user as User;
        const [note] = await db
          .insert(notes)
          .values({
            userId: user.id,
            title: req.body.title || file.originalname,
            content,
            source: req.body.source || "upload",
            tags,
          })
          .returning();

        // Clean up the uploaded file
        await fs.unlink(file.path).catch((err) => {
          console.error("Error cleaning up file:", err);
        });

        res.json(note);
      } catch (error: any) {
        const errorMessage = error.message || "Failed to process file";
        return res.status(400).send(errorMessage);
      }
    } catch (error) {
      console.error("Error handling upload:", error);
      if (filePath) {
        await fs.unlink(filePath).catch(() => {});
      }
      res.status(500).json({ error: "Failed to process upload" });
    }
  });

  app.get("/api/notes", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      console.log("Fetching notes for user:", {
        userId: user.id,
        email: user.email,
      });

      // Explicitly filter by userId for data isolation
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.userId, user.id));

      console.log(`Found ${userNotes.length} notes for user ${user.id}`);
      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Courses endpoints with user isolation
  app.post("/api/courses", requireAuth, async (req, res) => {
    try {
      console.log("Creating new course:", req.body);
      const user = req.user as User;

      // Validate required fields
      if (!req.body.title || !req.body.delivery) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate noteIds if provided
      if (req.body.noteIds?.length) {
        const noteIds = req.body.noteIds;
        // Verify all notes exist and belong to user
        const userNotes = await db
          .select()
          .from(notes)
          .where(eq(notes.userId, user.id));

        const userNoteIds = userNotes.map((note) => note.id);
        const invalidNotes = noteIds.filter(
          (id: number) => !userNoteIds.includes(id),
        );

        if (invalidNotes.length > 0) {
          return res.status(400).json({
            error: "Some notes are invalid or do not belong to you",
            invalidNotes,
          });
        }
      }

      console.log("Creating course with validated data");
      const [course] = await db
        .insert(courses)
        .values({
          userId: user.id,
          title: req.body.title,
          description: req.body.description,
          delivery: req.body.delivery,
          active: req.body.active ?? true,
        })
        .returning();

      console.log("Course created:", course.id);

      if (req.body.noteIds?.length) {
        console.log("Adding notes to course:", req.body.noteIds);
        await db.insert(courseNotes).values(
          req.body.noteIds.map((noteId: number, index: number) => ({
            courseId: course.id,
            noteId,
            order: index,
          })),
        );
      }

      res.json(course);
    } catch (error) {
      console.error("Error in course creation:", error);
      errorHandler(error, res);
    }
  });

  app.get("/api/courses", requireAuth, async (req, res) => {
    try {
      console.log("Fetching courses for user:", req.user?.id);
      const user = req.user as User;

      const userCourses = await db
        .select()
        .from(courses)
        .where(eq(courses.userId, user.id));

      res.json(userCourses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      errorHandler(error, res);
    }
  });

  app.get("/api/courses/:id/notes", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const courseId = parseInt(req.params.id);

      const courseBelongsToUserConditions = and(
        eq(courses.id, courseId),
        eq(courses.userId, user.id),
      );

      // First verify the course belongs to the user
      const [course] = await db
        .select()
        .from(courses)
        .where(courseBelongsToUserConditions)
        .limit(1);

      if (!course) {
        return res
          .status(404)
          .json({ error: "Course not found or unauthorized" });
      }

      // Get course notes with order, ensuring we only get notes belonging to the user
      const courseNotesList = await db
        .select()
        .from(courseNotes)
        .where(eq(courseNotes.courseId, courseId))
        .orderBy(courseNotes.order);

      // Get full note details, ensuring we only get notes belonging to the user
      const noteIds = courseNotesList.map((cn) => cn.noteId);
      const notesBelongsToUserConditions = and(
        eq(notes.userId, user.id),
        inArray(notes.id, noteIds),
      );
      const courseNoteDetails = await db
        .select()
        .from(notes)
        .where(notesBelongsToUserConditions);

      res.json(courseNoteDetails);
    } catch (error) {
      console.error("Error fetching course notes:", error);
      errorHandler(error, res);
    }
  });

  // Add new route for course analysis
  app.post("/api/courses/analyze", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { noteIds, processingStyle } = req.body;

      console.log("Analyzing notes for course creation. Input:", {
        noteIds,
        processingStyle,
        type: Array.isArray(noteIds) ? "array" : typeof noteIds,
      });

      if (!noteIds?.length) {
        return res
          .status(400)
          .json({ error: "No notes selected for analysis" });
      }

      // Ensure noteIds is an array
      const noteIdsArray = Array.isArray(noteIds) ? noteIds : [noteIds];

      // Format the array for PostgreSQL
      const pgArray = `{${noteIdsArray.join(",")}}`;
      console.log("Formatted PostgreSQL array:", pgArray);

      // Fetch the full note content for selected notes
      const selectedNotes = await db
        .select()
        .from(notes)
        .where(sql`${notes.id} = ANY(${pgArray}::int[])`);

      if (!selectedNotes.length) {
        return res.status(404).json({ error: "No valid notes found" });
      }

      console.log("Found notes:", selectedNotes.length);

      try {
        const analysis = await analyzeNotesForCourse(
          selectedNotes,
          processingStyle,
        );
        console.log("Analysis completed successfully:", {
          topics: analysis.topics.length,
          totalLessons: analysis.topics.reduce(
            (acc, topic) => acc + topic.sections.length,
            0,
          ),
          notesProcessed: analysis.totalNotesProcessed,
        });
        res.json(analysis);
      } catch (error: any) {
        console.error("Analysis error details:", {
          message: error.message,
          stack: error.stack,
          cause: error.cause,
        });
        res.status(500).json({
          error: error.message,
          details: "Check server logs for more information",
        });
      }
    } catch (error: any) {
      console.error("Route error:", error);
      res.status(500).json({ error: "Failed to process analyze request" });
    }
  });

  // Error handling middleware
  const errorHandler = (err: any, res: any) => {
    console.error("API Error:", err);
    const status = err.status || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ error: message });
  };

  app.post("/api/test-email", async (req, res) => {
    try {
      console.log("Testing email service functionality...");
      const response = await sendTestEmail();

      if (response.success) {
        console.log("Email service test successful:", response);
        res.json({
          success: true,
          message: "Email service is functioning correctly",
          details: response.message,
        });
      } else {
        console.error("Email service test failed:", response);
        res.status(503).json({
          success: false,
          message: "Email service is currently unavailable",
          details: response.details,
        });
      }
    } catch (error: any) {
      console.error("Unexpected error in email service:", error);
      res.status(500).json({
        success: false,
        message: "Unable to verify email service status",
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
