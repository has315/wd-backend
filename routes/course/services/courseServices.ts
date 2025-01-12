import OpenAI from "openai";
import { type Note } from "@db/schema";
import { z } from "zod";


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3
});

// Define strict schema for validation
const sectionSchema = z.object({
    number: z.string(),
    title: z.string(),
    learningContent: z.string(),
    story: z.string(),
    reflectionQuestion: z.string(),
    noteIds: z.array(z.number()),
    selected: z.boolean()
});

const topicSchema = z.object({
    title: z.string(),
    sections: z.array(sectionSchema),
    relatedNoteIds: z.array(z.number())
});

const analysisSchema = z.object({
    recommendedLessons: z.number(),
    totalNotesProcessed: z.number(),
    topics: z.array(topicSchema),
    unusedNoteIds: z.array(z.number()),
    maxLessons: z.number().optional()
});

type CourseSection = z.infer<typeof sectionSchema>;
type CourseTopic = z.infer<typeof topicSchema>;
type CourseAnalysis = z.infer<typeof analysisSchema>;


async function analyzeNotesForCourse(notes: Note[], processingStyle: number): Promise<CourseAnalysis> {
    const startTime = Date.now();
    try {
        console.log('Starting note analysis:', {
            numberOfNotes: notes.length,
            processingStyle,
            startTime: new Date(startTime).toISOString()
        });

        const chunkSize = 15; // Even smaller chunks to avoid token limits
        const entries = notes.flatMap(note => {
            const noteEntries = note.content
                .split(/[\n\r]+/)
                .map(entry => entry.trim())
                .filter(entry => entry && entry.length > 2);

            const chunks = [];
            for (let i = 0; i < noteEntries.length; i += chunkSize) {
                chunks.push(noteEntries.slice(i, i + chunkSize));
            }

            return chunks.map(chunk => ({
                id: note.id,
                content: chunk,
                title: note.title,
                tags: note.tags
            }));
        });

        const results = await Promise.all(entries.map(async (chunk) => {
            // Calculate total entries across all notes first
            const totalEntries = notes.reduce((sum, note) =>
                sum + note.content.split(/[\n\r]+/).filter(entry => entry.trim().length > 2).length, 0);

            // Set target lessons based on total entries and processing style
            const targetLessons = processingStyle === 1 ? totalEntries :  // 100% for granular
                processingStyle === 2 ? Math.ceil(totalEntries * 0.70) :    // 70% for balanced
                    Math.ceil(totalEntries * 0.30);                             // 30% for high synthesis

            console.log(`Processing style ${processingStyle}: Targeting ${targetLessons} lessons from ${totalEntries} total entries`);

            console.log(`Targeting ${targetLessons} lessons from ${chunk.content.length} entries`);
            console.log('Processing chunk with note ID:', chunk.id);

            return await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `Analyze and organize the provided entries into a coherent course structure. Mark all sections as selected.  Include the noteId in each section's noteIds array.
  Guidelines for processing style ${processingStyle}:
  ${processingStyle === 1 ? '1. Create one lesson per entry\n2. Keep entries as-is\n3. Ensure every entry becomes a lesson' :
                                processingStyle === 2 ? '1. Balance between preserving original content and synthesis\n2. Combine related entries when appropriate\n3. Moderate level of summarization' :
                                    '1. Focus on synthesizing and condensing content\n2. Combine related concepts into unified lessons\n3. Extract core learning points from longer entries'}
  Each lesson must include:
  - A clear title (max 100 chars)
  - Learning content (max 500 chars)
  - An illustrative story/example
  - A reflection question
  - Source note IDs (array of note IDs)
  
  Return the response as a JSON object with this structure (no additional text):
  {
    "recommendedLessons": ${targetLessons},
    "totalNotesProcessed": ${entries.length},
    "topics": [{
      "title": "Topic Name",
      "sections": [{
        "number": "1.1",
        "title": "Lesson Title",
        "learningContent": "Content",
        "story": "Story",
        "reflectionQuestion": "Question",
        "noteIds": [${chunk.id}],
        "selected": true
      }],
      "relatedNoteIds": []
    }],
    "unusedNoteIds": []
  }`
                    },
                    {
                        role: "user",
                        content: JSON.stringify(chunk)
                    }
                ],
                temperature: 0.1,
                max_tokens: 4000,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            });
        }));

        const combinedAnalysis = results.reduce<any>((acc, curr) => {
            if (!curr.choices[0].message.content) return acc;
            let analysis;
            try {
                analysis = JSON.parse(curr.choices[0].message.content || '{}');
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                console.log('Raw content:', curr.choices[0].message.content);
                return acc;
            }
            const totalEntries = notes.reduce((sum, note) =>
                sum + note.content.split(/[\n\r]+/).filter(entry => entry.trim().length > 2).length, 0);

            return {
                recommendedLessons: (acc.recommendedLessons || 0) + (analysis.recommendedLessons || 0),
                topics: [...(acc.topics || []), ...(analysis.topics || [])],
                totalNotesProcessed: totalEntries,
                unusedNoteIds: [...(acc.unusedNoteIds || []), ...(analysis.unusedNoteIds || [])],
            };
        }, {});

        if (!combinedAnalysis.topics) {
            throw new Error('OpenAI returned empty response');
        }

        return combinedAnalysis;

    } catch (error: any) {
        console.error('Course analysis failed:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: `${Date.now() - startTime}ms`
        });
        throw new Error(`Failed to analyze notes: ${error.message}`);
    }
}

async function generateCourseSummary(note: Note): Promise<string> {
    const startTime = Date.now();
    try {
        console.log('Generating summary for note:', {
            noteId: note.id,
            timestamp: new Date(startTime).toISOString()
        });

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "Create a concise, engaging summary of this note that captures the key insights and learning points."
                },
                {
                    role: "user",
                    content: note.content
                }
            ]
        });

        return response.choices[0].message.content || '';
    } catch (error: any) {
        console.error('Error generating note summary:', {
            timestamp: new Date().toISOString(),
            noteId: note.id,
            duration: `${Date.now() - startTime}ms`,
            error: {
                message: error.message,
                name: error.name,
                code: error.code,
                type: error.type,
                status: error.status
            }
        });
        throw new Error('Failed to generate note summary');
    }
}

async function suggestTopics(notes: Note[]): Promise<string[]> {
    const startTime = Date.now();
    try {
        console.log('Suggesting topics:', {
            timestamp: new Date(startTime).toISOString(),
            numberOfNotes: notes.length
        });

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `Analyze these notes and suggest relevant topic categories. 
            Provide your response as a JSON array of topic strings.`
                },
                {
                    role: "user",
                    content: JSON.stringify(notes.map(n => ({ content: n.content, tags: n.tags })))
                }
            ]
        });

        try {
            const content = response.choices[0].message.content || '{}';
            const result = typeof content === 'string' ? JSON.parse(content) : content;
            return Array.isArray(result) ? result : result.topics || [];
        } catch (error: any) {
            console.error('Error parsing topics response:', {
                timestamp: new Date().toISOString(),
                error: {
                    message: error.message,
                    name: error.name,
                    raw: response.choices[0].message.content
                }
            });
            return [];
        }
    } catch (error: any) {
        console.error('Error suggesting topics:', {
            timestamp: new Date().toISOString(),
            duration: `${Date.now() - startTime}ms`,
            error: {
                message: error.message,
                name: error.name,
                code: error.code,
                type: error.type,
                status: error.status
            }
        });
        throw new Error('Failed to suggest topics from notes');
    }
}



export const getCourse = async (courseID: number) => {

};

export const getAllCourses = async () => {

};

export default { getAllCourses, getCourse, analyzeNotesForCourse, generateCourseSummary, suggestTopics };
