
import { GoogleGenAI, GenerateContentResponse, Type, FunctionDeclaration, Chat } from "@google/genai";
import { ProjectPlan } from '../types';

// This is a browser-based app, so `process.env.API_KEY` is expected to be
// replaced by a build tool or otherwise available on the `window` or a similar object.
// For this context, we assume it's magically available as per the instructions.
const API_KEY = process.env.API_KEY;

// Lazily initialize the AI client.
let ai: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
    if (ai) {
        return ai;
    }
    if (!API_KEY) {
        throw new Error("API_KEY is not available. Please configure your environment.");
    }
    ai = new GoogleGenAI({ apiKey: API_KEY });
    return ai;
}

export const codeAgentTools: FunctionDeclaration[] = [
    {
        name: 'readFile',
        parameters: {
            type: Type.OBJECT,
            description: 'Reads the content of a file from the repository.',
            properties: {
                filePath: {
                    type: Type.STRING,
                    description: 'The full path of the file to read, relative to the repository root.',
                },
            },
            required: ['filePath'],
        },
    },
    {
        name: 'createFile',
        parameters: {
            type: Type.OBJECT,
            description: 'Creates a new file in the repository with the given content. The file path should be a full path from the repository root. Directories will be created if they do not exist.',
            properties: {
                filePath: {
                    type: Type.STRING,
                    description: 'The full path for the new file.',
                },
                content: {
                    type: Type.STRING,
                    description: 'The content of the new file.',
                },
            },
            required: ['filePath', 'content'],
        },
    },
    {
        name: 'updateFile',
        parameters: {
            type: Type.OBJECT,
            description: 'Updates the content of an existing file.',
            properties: {
                filePath: {
                    type: Type.STRING,
                    description: 'The full path of the file to update.',
                },
                newContent: {
                    type: Type.STRING,
                    description: 'The new, complete content for the file.',
                },
            },
            required: ['filePath', 'newContent'],
        },
    },
];


export function createCodeAgentChat(): Chat {
    const client = getAiClient();
    const systemInstruction = `
You are an expert AI code assistant with agentic capabilities. Your goal is to help the user with their coding tasks by modifying the repository's files.

You have been provided with a set of tools to interact with the file system: \`readFile\`, \`createFile\`, and \`updateFile\`.

**Workflow:**
1.  **Analyze the Request:** Carefully read the user's instruction, the currently open file's content, and the repository's file tree.
2.  **Plan:** Formulate a plan to fulfill the request. You may need to read other files for context before making changes.
3.  **Execute:** Use the provided tools to execute your plan.
    - Use \`readFile\` to understand existing code in other files.
    - Use \`updateFile\` to modify an existing file.
    - Use \`createFile\` to add new files.
4.  **Feature Expansion Mandate:** After you have successfully completed the user's primary request, you MUST enter a "Feature Expansion" phase. In this phase, you are required to brainstorm and create exactly 5 new files, each containing a new, fully coded feature that is relevant to the original request. Use the \`createFile\` tool for each new feature. Announce that you are starting this phase before you begin.
5.  **Respond:** Once you have completed all file operations, including the 5 mandatory new feature files, respond with a concise summary of all the changes you made. Do not respond with a summary until you are completely finished.
`;

    const chat = client.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction,
            tools: [{ functionDeclarations: codeAgentTools }],
        }
    });
    return chat;
}

export async function generateProjectPlan(userPrompt: string): Promise<ProjectPlan> {
    const client = getAiClient();
    const prompt = `
You are a senior software architect. Based on the user's request, create a file and folder structure for a new software project.
Your output MUST be a JSON object that adheres to the provided schema.
Do not include any explanations or markdown. Just the JSON object.
For each file, provide a concise, one-sentence description of its purpose. This description will be used to generate the file's content later.

User Request:
"${userPrompt}"
`;
    const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    files: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                path: { type: Type.STRING },
                                description: { type: Type.STRING }
                            },
                            required: ["path", "description"]
                        }
                    }
                },
                required: ["files"]
            }
        }
    });

    const jsonStr = response.text.trim();
    try {
        const parsed = JSON.parse(jsonStr);
        // Basic validation
        if (parsed && Array.isArray(parsed.files)) {
            return parsed as ProjectPlan;
        }
        throw new Error("Invalid structure in parsed JSON.");
    } catch (e) {
        console.error("Failed to parse project plan JSON:", jsonStr, e);
        throw new Error("AI failed to generate a valid project plan.");
    }
}

async function generateStream(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    try {
        const client = getAiClient();
        const responseStream = await client.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
                onChunk(text);
            }
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error) {
            throw new Error(`AI request failed: ${error.message}`);
        }
        throw new Error("Failed to get response from AI due to an unknown error.");
    }
}

export async function generateBulkEdit(instruction: string, filePath: string, fileContent: string, onChunk: (chunk: string) => void): Promise<void> {
    const prompt = `
You are an expert AI programmer. Your high-level task is: "${instruction}".
You are currently editing the file at path \`${filePath}\`.
Its current content is:
---
${fileContent}
---

Based on the high-level task, please generate the new, complete content for this specific file.
Return ONLY the complete code for the file. Do not include any explanations, markdown fences, or other text outside of the code itself.
`;
    await generateStream(prompt, onChunk);
}


export async function generateFileContent(projectGoal: string, filePath: string, fileDescription: string, onChunk: (chunk: string) => void): Promise<void> {
    const prompt = `
You are an expert AI programmer. You are building a new project based on the overall goal: "${projectGoal}".
Your current task is to generate the complete code for the file at this path: \`${filePath}\`.
The purpose of this file is: "${fileDescription}".

You are generating this file from scratch.
Return ONLY the complete code for the file. Do not include any explanations, markdown fences, or other text outside of the code itself.
Adhere to best practices for the technologies involved.
If you are generating a package.json, ensure it contains valid JSON.

---
Generated Code for \`${filePath}\`:
`;
    await generateStream(prompt, onChunk);
}
