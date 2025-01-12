import dotenv from 'dotenv';
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes/routes";
import { setupAuth } from "./auth";
import { createServer } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import { courseRouter } from 'routes/course/router/courseRouter';
const execAsync = promisify(exec);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


let server: ReturnType<typeof createServer> | null = null;

async function cleanup() {
  if (server) {
    return new Promise<void>((resolve) => {
      server!.close(() => {
        server = null;
        resolve();
      });
    });
  }
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);


app.use(
  "/",
   courseRouter
);

app.listen(process.env.PORT, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${process.env.PORT}`);
})

// async function startServer() {
//   try {
//     // Setup authentication first
//     setupAuth(app);

//     // Create and configure server
//     server = registerRoutes(app);

//     // Global error handling
//     app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
//       console.error("Server error:", err);
//       const status = err.status || err.statusCode || 500;
//       const message = err.message || "Internal Server Error";
//       res.status(status).json({ message });
//     });


//     // Attempt to start server
//     await new Promise<void>((resolve, reject) => {
//       const PORT = process.env.PORT || 5000;

//       server!.once("error", async (error: NodeJS.ErrnoException) => {
//         if (error.code === "EADDRINUSE") {
//           console.error(
//             `Port ${PORT} is already in use. Attempting to free port...`,
//           );
//           try {
//             // Try to kill existing process
//             await execAsync(`lsof -ti:${PORT} | xargs kill -9`);
//             console.log(`Killed existing process on port ${PORT}`);

//             // Wait a moment for the port to be released
//             await new Promise((resolve) => setTimeout(resolve, 1000));

//             // Try to start server again
//             server!.listen(PORT, () => {
//               // Modification here
//               console.log(`Server restarted successfully on port ${PORT}`);
//               resolve();
//             });
//           } catch (err) {
//             console.error("Failed to recover server:", err);
//             await cleanup();
//             process.exit(1);
//           }
//         } else {
//           console.error("Server error:", error);
//           reject(error);
//         }
//       });

//       server!.listen(PORT, () => {
//         // Modification here
//         console.log(`Server started successfully on port ${PORT}`);
//         resolve();
//       });
//     });
//   } catch (error) {
//     console.error("Failed to start server:", error);
//     await cleanup();
//     process.exit(1);
//   }
// }

// // Initialize server
// startServer().catch(async (error) => {
//   console.error("Unhandled server error:", error);
//   await cleanup();
//   process.exit(1);
// });
