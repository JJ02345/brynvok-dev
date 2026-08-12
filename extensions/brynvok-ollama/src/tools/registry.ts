import type { OllamaTool } from '../ollama/types';
import { createProposeEditTool } from './editTools';
import type { ParsedToolCall } from './parse';
import { ProposalStore } from './proposals';
import { createProposeCommandTool } from './terminalTools';
import type { ToolExecutionContext, ToolRunResult, WorkspaceTool } from './types';
import { listFilesTool, readFileTool, searchTextTool } from './workspaceTools';

export class ToolRegistry {
	readonly proposals = new ProposalStore();
	private readonly tools: WorkspaceTool[];
	private readonly byName: Map<string, WorkspaceTool>;

	constructor() {
		this.tools = [
			listFilesTool,
			readFileTool,
			searchTextTool,
			createProposeEditTool(this.proposals),
			createProposeCommandTool(this.proposals),
		];
		this.byName = new Map(this.tools.map((tool) => [tool.definition.function.name, tool]));
	}

	definitions(): OllamaTool[] {
		return this.tools.map((tool) => tool.definition);
	}

	async execute(call: ParsedToolCall, context: ToolExecutionContext): Promise<ToolRunResult> {
		const tool = this.byName.get(call.name);

		if (!tool) {
			return {
				content: `Unknown tool "${call.name}". Available: ${[...this.byName.keys()].join(', ')}.`,
			};
		}

		context.log(`${call.name}(${JSON.stringify(call.arguments)})`);
		return tool.run(call, context);
	}
}

export const AGENT_SYSTEM_ADDENDUM = `You can use tools to inspect and change the open workspace.

Rules:
- Prefer list_files / search_text before guessing paths.
- Use read_file before editing an existing file.
- Use propose_edit to create or change files. Never claim a file was written; the user must click Apply.
- Use propose_command for shell commands. Never claim a command ran; the user must click Run.
- Keep answers short once the tools have done the work.
- Stay inside the workspace. Do not invent absolute paths outside it.`;
