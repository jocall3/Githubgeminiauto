import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
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

async function generateCodeEditStream(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
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
            // Propagate a more informative error message.
            throw new Error(`AI request failed: ${error.message}`);
        }
        throw new Error("Failed to get response from AI due to an unknown error.");
    }
}


export async function editFileWithAI(currentCode: string, instruction: string, onChunk: (chunk: string) => void): Promise<void> {
  const prompt = `
You are an expert code assistant. Your task is to modify the provided code based on the user's instruction.
You MUST return only the complete, updated code block. Do not add any explanations, introductory text, or markdown code fences like \`\`\`.

Instruction:
${instruction}

---

Original Code:
${currentCode}

---

Updated Code:
`;
  await generateCodeEditStream(prompt, onChunk);
}

export async function bulkEditFileWithAI(currentCode: string, instruction: string, filePath: string, onChunk: (chunk: string) => void): Promise<void> {
    const prompt = `
You are an expert AI programmer executing a high-level directive across an entire codebase.
For the file located at \`${filePath}\`, apply the following overall instruction:
"${instruction}"

Your task is to significantly enhance and expand this specific file based on the instruction.
- Add new features, classes, and functions that are relevant to the file's purpose and the main instruction. The goal is to substantially increase the file's value and content.
- You MUST NOT change or remove any existing import statements.
- Any new top-level functions, classes, or variables you create MUST be exported.
- Your changes should be mindful of the entire repository's architecture. Create code that can intelligently interact with other modules.
- Adhere strictly to the coding style and language of the original file.

Return ONLY the complete, updated code for the file. Do not include any explanations, markdown fences, or other text outside of the code itself.

---
Original Code from \`${filePath}\`:
${currentCode}
---

Updated Code:
`;
    await generateCodeEditStream(prompt, onChunk);
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
    await generateCodeEditStream(prompt, onChunk);
}
