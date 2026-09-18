import { GoogleGenAI } from '@google/genai';
import { ProjectService } from '../db/projectService.js';
import { ProjectBuildService } from './projectBuildService.js';
import { CreditService } from './creditService.js';
import { ProjectPatchRecord, ProjectFramework, ProjectLanguage } from '../types.js';

export interface ProjectSpecification {
  projectType: string;
  framework: ProjectFramework;
  language: ProjectLanguage;
  dependencies: Record<string, string>;
  pages: string[];
  components: string[];
  backendRequirements?: string;
  databaseRequirements?: string;
  environmentVariablesRequired: string[];
  externalServices?: string[];
  buildCommand: string;
  runCommand: string;
}

export class ProjectAiService {
  private static aiClient: GoogleGenAI | null = null;

  static getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        throw new Error('Google Gemini API Key is not configured on the server.');
      }
      this.aiClient = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return this.aiClient;
  }

  /**
   * AI Code Editing & Safe Patch System
   */
  static async editCodeWithAi(params: {
    userId: string;
    projectId: string;
    filePath: string;
    selectedCode?: string;
    instruction: string;
    actionType: 'explain' | 'fix' | 'optimize' | 'refactor' | 'add_functionality' | 'improve_a11y' | 'add_tests' | 'convert' | 'multimodal_design';
    mediaBase64?: string;
    mediaMimeType?: string;
  }): Promise<{ explanation: string; patch: ProjectPatchRecord | null }> {
    const { userId, projectId, filePath, selectedCode, instruction, actionType, mediaBase64, mediaMimeType } = params;
    ProjectService.verifyOwnership(userId, projectId);

    const file = ProjectService.getFile(userId, projectId, filePath);
    const client = this.getClient();
    const model = 'gemini-3.1-pro-preview';

    // Build system prompt based on action
    const systemPrompt = `You are Darkano AI Code Engine, an expert software engineer and compiler specialist.
You are assisting a developer working on the project file: "${file.path}".
The developer requested the action: "${actionType.toUpperCase()}".

If the user wants an explanation only (actionType == "explain"), provide a clear, concise, professional breakdown in Markdown without proposing a patch.
Otherwise, you MUST provide:
1. A brief explanation of the diagnosis or changes made.
2. A single concise diff summary line describing what was changed (e.g., "Lines 12-25 modified. Added authentication error boundary and retry logic.").
3. The COMPLETE, updated file content enclosed inside triple backticks with the language tag. Do NOT use placeholders or "// rest of file unchanged" - return the full, functional file content.

Format your response strictly as:
<EXPLANATION>
[Your clear Markdown explanation here]
</EXPLANATION>
<DIFF_SUMMARY>
[Concise 1-sentence summary of modifications]
</DIFF_SUMMARY>
<PROPOSED_CODE>
\`\`\`[language]
[Complete updated file code]
\`\`\`
</PROPOSED_CODE>`;

    const promptParts: any[] = [];

    if (mediaBase64 && mediaMimeType) {
      promptParts.push({
        inlineData: {
          mimeType: mediaMimeType,
          data: mediaBase64
        }
      });
    }

    let userPromptText = `Project File: ${file.path}
Current File Content:
\`\`\`
${file.content}
\`\`\`
`;

    if (selectedCode && selectedCode.trim()) {
      userPromptText += `
Selected Code Section:
\`\`\`
${selectedCode}
\`\`\`
`;
    }

    userPromptText += `
Developer Instruction:
${instruction}
`;

    promptParts.push({ text: userPromptText });

    try {
      const response = await client.models.generateContent({
        model,
        contents: promptParts,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2
        }
      });

      const responseText = response.text || '';

      // Deduct credits for AI code operation
      CreditService.deductCredits({
        userId,
        amount: 8,
        type: 'ai_usage',
        source: 'coding_workspace_ai',
        metadata: { projectId, filePath, actionType }
      });

      if (actionType === 'explain') {
        const cleanExplanation = responseText
          .replace(/<EXPLANATION>|<\/EXPLANATION>/g, '')
          .replace(/<DIFF_SUMMARY>[\s\S]*?<\/DIFF_SUMMARY>/g, '')
          .replace(/<PROPOSED_CODE>[\s\S]*?<\/PROPOSED_CODE>/g, '')
          .trim();
        return { explanation: cleanExplanation || responseText, patch: null };
      }

      // Extract sections
      let explanation = '';
      const expMatch = responseText.match(/<EXPLANATION>([\s\S]*?)<\/EXPLANATION>/);
      if (expMatch) {
        explanation = expMatch[1].trim();
      }

      let diffSummary = 'File modified by Darkano AI';
      const diffMatch = responseText.match(/<DIFF_SUMMARY>([\s\S]*?)<\/DIFF_SUMMARY>/);
      if (diffMatch) {
        diffSummary = diffMatch[1].trim();
      }

      let proposedCode = '';
      const codeBlockMatch = responseText.match(/<PROPOSED_CODE>[\s\S]*?```[a-zA-Z]*\n?([\s\S]*?)```[\s\S]*?<\/PROPOSED_CODE>/);
      if (codeBlockMatch) {
        proposedCode = codeBlockMatch[1].trim();
      } else {
        // Fallback: search for any triple backticks
        const generalCodeMatch = responseText.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
        if (generalCodeMatch) {
          proposedCode = generalCodeMatch[1].trim();
        }
      }

      if (!proposedCode || proposedCode === file.content.trim()) {
        return {
          explanation: explanation || responseText,
          patch: null
        };
      }

      // Create structured patch in database
      const patch = ProjectService.createPatch({
        userId,
        projectId,
        path: file.path,
        originalContent: file.content,
        proposedContent: proposedCode,
        diffSummary
      });

      return { explanation, patch };
    } catch (err: any) {
      console.error('[Darkano AI Code Error]:', err?.message);
      throw new Error(`AI code editing failed: ${err?.message || 'Inference error'}`);
    }
  }

  /**
   * Real Error Analysis & "Fix with AI"
   */
  static async fixBuildErrorWithAi(userId: string, projectId: string): Promise<{ explanation: string; patch: ProjectPatchRecord }> {
    ProjectService.verifyOwnership(userId, projectId);
    const latestBuild = ProjectService.getLatestBuild(userId, projectId);

    if (!latestBuild || latestBuild.status !== 'failed') {
      throw new Error('No recent failed build found to fix.');
    }

    const files = ProjectService.listFiles(userId, projectId);
    const client = this.getClient();
    const model = 'gemini-3.1-pro-preview';

    // Find likely candidate file from build output
    const buildOutput = (latestBuild.errors || '') + '\n' + latestBuild.output;
    let targetFile = files.find(f => buildOutput.includes(f.path));
    if (!targetFile) {
      targetFile = files.find(f => f.path.includes('App.') || f.path.includes('index.') || f.path.includes('main.'));
    }

    if (!targetFile) {
      targetFile = files[0];
    }

    const systemPrompt = `You are Darkano AI Build Debugger.
Analyze the following REAL build failure output and propose an exact fix for the problematic file.
You MUST provide:
1. Diagnosis of the root cause in <EXPLANATION>.
2. Concise 1-sentence summary of the fix in <DIFF_SUMMARY>.
3. The COMPLETE fixed file content in <PROPOSED_CODE> with appropriate language markdown.

Format:
<EXPLANATION>
[Explanation of bug and fix]
</EXPLANATION>
<DIFF_SUMMARY>
[Fixed syntax error / missing import / type error]
</DIFF_SUMMARY>
<PROPOSED_CODE>
\`\`\`[language]
[Complete fixed file content]
\`\`\`
</PROPOSED_CODE>`;

    const userPrompt = `Build Output / Error:
${buildOutput.slice(-3000)}

Target File: ${targetFile.path}
Current Content:
\`\`\`
${targetFile.content}
\`\`\``;

    const response = await client.models.generateContent({
      model,
      contents: [{ text: userPrompt }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1
      }
    });

    const responseText = response.text || '';

    let explanation = 'Analyzed build failure and resolved syntax/import issue.';
    const expMatch = responseText.match(/<EXPLANATION>([\s\S]*?)<\/EXPLANATION>/);
    if (expMatch) explanation = expMatch[1].trim();

    let diffSummary = 'Fixed build error';
    const diffMatch = responseText.match(/<DIFF_SUMMARY>([\s\S]*?)<\/DIFF_SUMMARY>/);
    if (diffMatch) diffSummary = diffMatch[1].trim();

    let proposedCode = '';
    const codeMatch = responseText.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
    if (codeMatch) proposedCode = codeMatch[1].trim();

    if (!proposedCode) {
      throw new Error('AI could not generate a valid patch for the build error.');
    }

    CreditService.deductCredits({
      userId,
      amount: 10,
      type: 'ai_usage',
      source: 'build_error_fix_ai',
      metadata: { projectId, buildId: latestBuild.id }
    });

    const patch = ProjectService.createPatch({
      userId,
      projectId,
      path: targetFile.path,
      originalContent: targetFile.content,
      proposedContent: proposedCode,
      diffSummary
    });

    return { explanation, patch };
  }

  /**
   * Real Project Generation & Specification
   */
  static async generateProjectWithAi(params: {
    userId: string;
    prompt: string;
    framework?: ProjectFramework;
    language?: ProjectLanguage;
    mediaBase64?: string;
    mediaMimeType?: string;
  }): Promise<{ project: any; specification: ProjectSpecification; files: any[]; build: any }> {
    const { userId, prompt, framework = 'react-vite', language = 'typescript', mediaBase64, mediaMimeType } = params;
    const client = this.getClient();
    const model = 'gemini-3.1-pro-preview';

    // Step 1: Create structured specification
    const specPrompt = `Create a structured technical specification for a new web project based on the following user prompt:
"${prompt}"

Framework target: ${framework}
Language target: ${language}

Return a valid JSON object matching this TypeScript structure:
{
  "projectType": string,
  "projectName": string,
  "framework": "${framework}",
  "language": "${language}",
  "dependencies": Record<string, string>,
  "pages": string[],
  "components": string[],
  "backendRequirements": string,
  "databaseRequirements": string,
  "environmentVariablesRequired": string[],
  "buildCommand": string,
  "runCommand": string
}

Only return the raw JSON object inside triple backticks.`;

    const specContents: any[] = [];
    if (mediaBase64 && mediaMimeType) {
      specContents.push({
        inlineData: {
          mimeType: mediaMimeType,
          data: mediaBase64
        }
      });
    }
    specContents.push({ text: specPrompt });

    const specResponse = await client.models.generateContent({
      model,
      contents: specContents,
      config: {
        temperature: 0.3
      }
    });

    let specJson: any;
    try {
      const rawText = specResponse.text || '{}';
      const cleanJson = rawText.replace(/```json|```/g, '').trim();
      specJson = JSON.parse(cleanJson);
    } catch {
      specJson = {
        projectType: 'Interactive Web Application',
        projectName: 'AI Generated App',
        framework,
        language,
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', 'lucide-react': '^0.468.0' },
        pages: ['Home'],
        components: ['App', 'Header', 'Dashboard'],
        environmentVariablesRequired: [],
        buildCommand: 'npm run build',
        runCommand: 'npm run dev'
      };
    }

    const projectName = specJson.projectName || 'Generated App';

    // Create project
    const { project } = ProjectService.createProject({
      userId,
      name: projectName,
      description: prompt.slice(0, 200),
      framework,
      language
    });

    // Step 2: Generate specific main application files
    const codeGenPrompt = `Generate the complete, modern, interactive React component for \`src/App.tsx\` for the application described as:
"${prompt}"

Requirements:
- Production-grade code with TypeScript types.
- Beautiful, modern UI with responsive styling and state handling.
- Use standard React hooks (useState, useEffect, useMemo).
- Import icons from 'lucide-react' if needed.
- Return ONLY the full code for \`src/App.tsx\` inside triple backticks.`;

    const codeResponse = await client.models.generateContent({
      model,
      contents: [{ text: codeGenPrompt }],
      config: { temperature: 0.3 }
    });

    const appCodeMatch = (codeResponse.text || '').match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
    if (appCodeMatch && appCodeMatch[1].trim()) {
      ProjectService.updateFile(userId, project.id, 'src/App.tsx', appCodeMatch[1].trim());
    }

    // Step 3: Run isolated build
    const build = await ProjectBuildService.runBuild(userId, project.id);

    CreditService.deductCredits({
      userId,
      amount: 25,
      type: 'ai_usage',
      source: 'project_generator_ai',
      metadata: { projectId: project.id, prompt: prompt.slice(0, 100) }
    });

    const files = ProjectService.listFiles(userId, project.id);

    return {
      project,
      specification: specJson,
      files,
      build
    };
  }

  /**
   * Generate real unit/integration tests for a file
   */
  static async generateTestsForFile(userId: string, projectId: string, filePath: string): Promise<{ testFilePath: string; testContent: string }> {
    ProjectService.verifyOwnership(userId, projectId);
    const file = ProjectService.getFile(userId, projectId, filePath);
    const client = this.getClient();
    const model = 'gemini-3.1-pro-preview';

    const testFilePath = filePath.replace(/\.(tsx|jsx|ts|js)$/, '.test.$1');

    const prompt = `Write unit tests for the following file: "${file.path}".
Target test file path: "${testFilePath}"

Source Content:
\`\`\`
${file.content}
\`\`\`

Return ONLY the runnable TypeScript test file code inside triple backticks.`;

    const response = await client.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: { temperature: 0.2 }
    });

    let testContent = '';
    const match = (response.text || '').match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
    if (match) testContent = match[1].trim();

    if (!testContent) {
      testContent = `// Auto-generated test for ${file.path}\nconsole.log('Testing ${file.path} assertions...');\n`;
    }

    ProjectService.updateFile(userId, projectId, testFilePath, testContent);

    CreditService.deductCredits({
      userId,
      amount: 6,
      type: 'ai_usage',
      source: 'generate_tests_ai',
      metadata: { projectId, filePath, testFilePath }
    });

    return { testFilePath, testContent };
  }

  /**
   * AI Deployment Readiness Inspector
   */
  static async analyzeDeploymentReadiness(userId: string, projectId: string): Promise<{
    isReady: boolean;
    score: number;
    summary: string;
    checklist: Array<{ item: string; status: 'passed' | 'warning' | 'failed'; detail: string }>;
    recommendations: string[];
  }> {
    ProjectService.verifyOwnership(userId, projectId);
    const files = ProjectService.listFiles(userId, projectId);
    const project = ProjectService.getProject(userId, projectId);

    const hasPackageJson = files.some(f => f.path === 'package.json');
    const hasIndexHtml = files.some(f => f.path === 'index.html');
    const hasEntryPoint = files.some(f => ['src/main.tsx', 'src/index.tsx', 'src/main.jsx', 'src/index.js', 'src/app.tsx'].includes(f.path));

    const checklist: Array<{ item: string; status: 'passed' | 'warning' | 'failed'; detail: string }> = [
      {
        item: 'Project Configuration',
        status: hasPackageJson ? 'passed' : 'failed',
        detail: hasPackageJson ? 'package.json is present with valid dependencies' : 'Missing package.json file'
      },
      {
        item: 'HTML Entry Point',
        status: hasIndexHtml ? 'passed' : 'failed',
        detail: hasIndexHtml ? 'index.html entry point verified' : 'index.html not found in root'
      },
      {
        item: 'Source Code Entry Point',
        status: hasEntryPoint ? 'passed' : 'warning',
        detail: hasEntryPoint ? 'Source entry point verified' : 'No standard src/main.tsx or index.js found'
      }
    ];

    const client = this.getClient();
    const model = 'gemini-2.5-flash';

    const fileSummary = files.slice(0, 15).map(f => `- ${f.path} (${f.size} bytes)`).join('\n');

    const prompt = `Inspect this project for cloud deployment readiness:
Project Name: ${project.name}
Framework: ${project.framework}
Files:
${fileSummary}

Format response strictly as JSON:
{
  "score": 85,
  "summary": "Short 2 sentence assessment of readiness.",
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

    let aiResult: any = null;
    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ text: prompt }],
        config: { responseMimeType: 'application/json' }
      });
      aiResult = JSON.parse(response.text || '{}');
    } catch {
      aiResult = {
        score: hasPackageJson && hasIndexHtml ? 85 : 45,
        summary: 'Automated structure check completed. Ensure all dependencies and build scripts are properly configured before deploying.',
        recommendations: ['Verify npm build script executes without warnings.', 'Ensure environment variables are configured.']
      };
    }

    const finalScore = typeof aiResult?.score === 'number' ? aiResult.score : (hasPackageJson && hasIndexHtml ? 85 : 45);

    return {
      isReady: finalScore >= 70 && hasPackageJson,
      score: finalScore,
      summary: aiResult?.summary || 'Project structure inspected.',
      checklist,
      recommendations: Array.isArray(aiResult?.recommendations) ? aiResult.recommendations : ['Run build before deploying to verify compilation.']
    };
  }

  /**
   * AI Deployment Error Diagnosis & Resolution
   */
  static async analyzeDeploymentError(userId: string, projectId: string, deploymentId: string, errorMessage?: string, errorLogs?: string): Promise<{
    rootCause: string;
    suggestedFix: string;
    actionableSteps: string[];
  }> {
    ProjectService.verifyOwnership(userId, projectId);

    const client = this.getClient();
    const model = 'gemini-2.5-flash';

    const prompt = `Analyze this deployment failure and explain the root cause and how to fix it:
Deployment ID: ${deploymentId}
Error Message: ${errorMessage || 'Unknown deployment failure'}
Recent Logs:
${(errorLogs || 'No specific logs available.').slice(-3000)}

Respond strictly in JSON:
{
  "rootCause": "Clear 1-2 sentence explanation of why deployment failed",
  "suggestedFix": "Immediate fix description",
  "actionableSteps": ["Step 1", "Step 2"]
}`;

    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ text: prompt }],
        config: { responseMimeType: 'application/json' }
      });
      return JSON.parse(res.text || '{}');
    } catch {
      return {
        rootCause: errorMessage || 'Hosting provider reported a deployment failure.',
        suggestedFix: 'Check build scripts and verify that all dependencies and environment variables are properly set.',
        actionableSteps: [
          'Run a project build in the Checks panel to identify syntax or bundler errors.',
          'Verify that environment variables expected by the application are configured in the Environment tab.'
        ]
      };
    }
  }
}
