import { asString } from './paths';
import { buildUnifiedDiff, loadExistingText, type ProposalStore } from './proposals';
import type { WorkspaceTool } from './types';

export function createProposeEditTool(store: ProposalStore): WorkspaceTool {
	return {
		kind: 'propose_edit',
		definition: {
			type: 'function',
			function: {
				name: 'propose_edit',
				description:
					'Propose creating or overwriting a file with the given contents. The change is shown to the user as a diff and is written only when they click Apply. Never claim the file was written.',
				parameters: {
					type: 'object',
					properties: {
						path: {
							type: 'string',
							description: 'Relative file path to create or overwrite.',
						},
						content: {
							type: 'string',
							description: 'Full new file contents.',
						},
					},
					required: ['path', 'content'],
				},
			},
		},
		async run(call) {
			const path = asString(call.arguments.path);
			const content = asString(call.arguments.content);

			if (!path) {
				return { content: 'propose_edit requires a path argument.' };
			}

			try {
				const existing = await loadExistingText(path);
				const diff = buildUnifiedDiff(existing.relativePath, existing.text, content);
				const proposal = store.createEdit({
					path: existing.relativePath,
					uri: existing.uri,
					isNew: existing.isNew,
					previous: existing.text,
					next: content,
					diff,
				});
				const summary = existing.isNew
					? `New file (${content.split(/\r?\n/).length} lines)`
					: `Replace ${existing.text?.split(/\r?\n/).length ?? 0} lines with ${content.split(/\r?\n/).length} lines`;

				return {
					content: existing.isNew
						? `Proposed new file ${existing.relativePath}. Waiting for the user to click Apply before writing.`
						: `Proposed edit to ${existing.relativePath}. Waiting for the user to click Apply before writing.`,
					awaitUser: true,
					card: {
						kind: 'edit',
						proposalId: proposal.id,
						path: existing.relativePath,
						isNew: existing.isNew,
						summary,
						diff,
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
