(function () {
	'use strict';

	const vscode = acquireVsCodeApi();

	const log = document.getElementById('log');
	const promptBox = document.getElementById('prompt');
	const sendButton = document.getElementById('send');
	const stopButton = document.getElementById('stop');
	const modelButton = document.getElementById('model');
	const includeSelection = document.getElementById('include-selection');

	/** Raw text and target element of the reply currently streaming in. */
	let pending = null;

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
