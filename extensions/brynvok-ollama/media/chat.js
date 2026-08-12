(function () {
	'use strict';

	const vscode = acquireVsCodeApi();

	const log = document.getElementById('log');
	const statusEl = document.getElementById('status');
	const promptBox = document.getElementById('prompt');
	const sendButton = document.getElementById('send');
	const stopButton = document.getElementById('stop');
	const modelButton = document.getElementById('model');
	const includeSelection = document.getElementById('include-selection');

	/** Raw text and target element of the reply currently streaming in. */
	let pending = null;
	const cards = new Map();

	function addMessage(role) {
		const element = document.createElement('div');
		element.className = 'message ' + role;
		log.appendChild(element);
		return element;
	}

	function scrollToEnd() {
		log.scrollTop = log.scrollHeight;
	}

	/**
	 * Renders fenced code blocks and leaves everything else as plain text.
	 * Nodes are built with textContent, so model output can never become
	 * markup in the view.
	 */
	function render(container, raw) {
		container.textContent = '';

		raw.split('```').forEach(function (part, index) {
			if (index % 2 === 1) {
				container.appendChild(codeBlock(part));
				return;
			}

			const text = part.replace(/^\n+|\n+$/g, '');

			if (text) {
				const paragraph = document.createElement('p');
				paragraph.textContent = text;
				container.appendChild(paragraph);
			}
		});
	}

	function codeBlock(part) {
		const newline = part.indexOf('\n');
		const language = newline >= 0 ? part.slice(0, newline).trim() : '';
		const body = newline >= 0 ? part.slice(newline + 1) : part;

		const wrapper = document.createElement('div');
		wrapper.className = 'code';

		const header = document.createElement('div');
		header.className = 'code-header';

		const label = document.createElement('span');
		label.textContent = language || 'code';
		header.appendChild(label);

		const copy = document.createElement('button');
		copy.type = 'button';
		copy.className = 'link';
		copy.textContent = 'Copy';
		copy.addEventListener('click', function () {
			navigator.clipboard.writeText(body).then(function () {
				copy.textContent = 'Copied';
				setTimeout(function () {
					copy.textContent = 'Copy';
				}, 1500);
			});
		});
		header.appendChild(copy);

		const pre = document.createElement('pre');
		const code = document.createElement('code');
		code.textContent = body;
		pre.appendChild(code);

		wrapper.appendChild(header);
		wrapper.appendChild(pre);

		return wrapper;
	}

	function setBusy(busy) {
		sendButton.hidden = busy;
		stopButton.hidden = !busy;
		promptBox.disabled = busy;
	}

	function setStatus(text) {
		if (!text) {
			statusEl.hidden = true;
			statusEl.textContent = '';
			return;
		}

		statusEl.hidden = false;
		statusEl.textContent = text;
	}

	function renderToolCard(card) {
		const element = document.createElement('div');
		element.className = 'tool-card';

		if (card.kind === 'info') {
			element.classList.add('info');
			const title = document.createElement('div');
			title.className = 'tool-title';
			title.textContent = card.title;
			const body = document.createElement('pre');
			body.className = 'tool-body';
			body.textContent = card.body;
			element.appendChild(title);
			element.appendChild(body);
			log.appendChild(element);
			scrollToEnd();
			return;
		}

		if (card.kind === 'edit') {
			element.classList.add('edit');
			element.dataset.proposalId = card.proposalId;

			const title = document.createElement('div');
			title.className = 'tool-title';
			title.textContent = (card.isNew ? 'New file: ' : 'Edit: ') + card.path;

			const summary = document.createElement('div');
			summary.className = 'tool-summary';
			summary.textContent = card.summary;

			const diff = document.createElement('pre');
			diff.className = 'tool-diff';
			diff.textContent = card.diff;

			const actions = document.createElement('div');
			actions.className = 'tool-actions';

			const apply = document.createElement('button');
			apply.type = 'button';
			apply.textContent = 'Apply';
			apply.addEventListener('click', function () {
				vscode.postMessage({ type: 'applyProposal', id: card.proposalId });
			});

			const dismiss = document.createElement('button');
			dismiss.type = 'button';
			dismiss.className = 'secondary';
			dismiss.textContent = 'Dismiss';
			dismiss.addEventListener('click', function () {
				vscode.postMessage({ type: 'dismissProposal', id: card.proposalId });
			});

			actions.appendChild(apply);
			actions.appendChild(dismiss);
			element.appendChild(title);
			element.appendChild(summary);
			element.appendChild(diff);
			element.appendChild(actions);
			log.appendChild(element);
			cards.set(card.proposalId, { element: element, apply: apply, dismiss: dismiss });
			scrollToEnd();
			return;
		}

		if (card.kind === 'command') {
			element.classList.add('command');
			element.dataset.proposalId = card.proposalId;

			const title = document.createElement('div');
			title.className = 'tool-title';
			title.textContent = 'Terminal command';

			const cwd = document.createElement('div');
			cwd.className = 'tool-summary';
			cwd.textContent = 'cwd: ' + card.cwd;

			const command = document.createElement('pre');
			command.className = 'tool-command';
			command.textContent = card.command;

			const actions = document.createElement('div');
			actions.className = 'tool-actions';

			const run = document.createElement('button');
			run.type = 'button';
			run.textContent = 'Run';
			run.addEventListener('click', function () {
				vscode.postMessage({ type: 'runProposal', id: card.proposalId });
			});

			const dismiss = document.createElement('button');
			dismiss.type = 'button';
			dismiss.className = 'secondary';
			dismiss.textContent = 'Dismiss';
			dismiss.addEventListener('click', function () {
				vscode.postMessage({ type: 'dismissProposal', id: card.proposalId });
			});

			actions.appendChild(run);
			actions.appendChild(dismiss);
			element.appendChild(title);
			element.appendChild(cwd);
			element.appendChild(command);
			element.appendChild(actions);
			log.appendChild(element);
			cards.set(card.proposalId, { element: element, apply: run, dismiss: dismiss });
			scrollToEnd();
		}
	}

	function updateProposalStatus(id, status, message) {
		const card = cards.get(id);

		if (!card) {
			return;
		}

		card.element.classList.add('resolved');
		card.element.classList.add('status-' + status);

		if (card.apply) {
			card.apply.disabled = true;
			if (status === 'applied') {
				card.apply.textContent = 'Applied';
			} else if (status === 'ran') {
				card.apply.textContent = 'Ran';
			} else if (status === 'dismissed') {
				card.apply.textContent = 'Dismissed';
			} else if (status === 'error') {
				card.apply.textContent = 'Failed';
			}
		}

		if (card.dismiss) {
			card.dismiss.disabled = true;
			card.dismiss.hidden = status !== 'pending';
		}

		if (message) {
			const note = document.createElement('div');
			note.className = 'tool-error';
			note.textContent = message;
			card.element.appendChild(note);
		}
	}

	function submit() {
		const text = promptBox.value.trim();

		if (!text) {
			return;
		}

		promptBox.value = '';
		vscode.postMessage({
			type: 'prompt',
			text: text,
			includeSelection: includeSelection.checked,
		});
	}

	window.addEventListener('message', function (event) {
		const message = event.data;

		switch (message.type) {
			case 'state':
				modelButton.textContent = message.model;
				setBusy(message.busy);
				break;

			case 'user':
				render(addMessage('user'), message.text);
				scrollToEnd();
				break;

			case 'start':
				pending = { raw: '', element: addMessage('assistant') };
				break;

			case 'delta':
				if (pending) {
					pending.raw += message.text;
					render(pending.element, pending.raw);
					scrollToEnd();
				}
				break;

			case 'done':
				if (pending && !pending.raw) {
					pending.element.remove();
				}
				pending = null;
				setBusy(false);
				break;

			case 'error': {
				if (pending && !pending.raw) {
					pending.element.remove();
				}
				pending = null;
				const element = addMessage('error');
				element.textContent = message.message;
				scrollToEnd();
				setBusy(false);
				break;
			}

			case 'cleared':
				log.textContent = '';
				pending = null;
				cards.clear();
				setStatus('');
				break;

			case 'status':
				setStatus(message.text || '');
				break;

			case 'toolCard':
				renderToolCard(message.card);
				break;

			case 'proposalStatus':
				updateProposalStatus(message.id, message.status, message.message);
				break;
		}
	});

	sendButton.addEventListener('click', submit);
	stopButton.addEventListener('click', function () {
		vscode.postMessage({ type: 'abort' });
	});
	modelButton.addEventListener('click', function () {
		vscode.postMessage({ type: 'pickModel' });
	});

	promptBox.addEventListener('keydown', function (event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	});

	vscode.postMessage({ type: 'ready' });
})();
