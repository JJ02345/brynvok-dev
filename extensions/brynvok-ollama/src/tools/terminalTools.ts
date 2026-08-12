import { asString, requireWorkspaceRoot, resolveWorkspacePath } from './paths';
import type { ProposalStore } from './proposals';
import type { WorkspaceTool } from './types';

export function createProposeCommandTool(store: ProposalStore): WorkspaceTool {
	return {
		kind: 'propose_command',
		definition: {
			type: 'function',
			function: {
				name: 'propose_command',
				description:
					'Propose a shell command to run in the integrated terminal. The command is shown to the user and runs only when they click Run. Never claim it already ran.',
				parameters: {
					type: 'object',
					properties: {
						command: {
							type: 'string',
							description: 'The exact shell command to run.',
						},
						cwd: {
							type: 'string',
							description: 'Optional working directory relative to the workspace root.',
						},
					},
					required: ['command'],
				},
			},
		},
		async run(call) {
			const command = asString(call.arguments.command).trim();

			if (!command) {
				return { content: 'propose_command requires a command argument.' };
			}

			if (command.includes('\n') || command.includes('\r')) {
				return { content: 'propose_command accepts a single line only.' };
			}

			try {
				const root = requireWorkspaceRoot();
				const cwdArg = asString(call.arguments.cwd).trim();
				let cwd = root.fsPath;
				let cwdLabel = '.';

				if (cwdArg && cwdArg !== '.') {
					const resolved = resolveWorkspacePath(cwdArg);
					cwd = resolved.uri.fsPath;
					cwdLabel = resolved.relativePath;
				}

				const proposal = store.createCommand(command, cwd);

				return {
					content: `Proposed command for the integrated terminal. Waiting for the user to click Run before executing:\n${command}`,
					awaitUser: true,
					card: {
						kind: 'command',
						proposalId: proposal.id,
						command,
						cwd: cwdLabel,
					},
				};
			} catch (error) {
				return {
					content: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}
