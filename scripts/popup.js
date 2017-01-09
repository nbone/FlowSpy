$(function () {
	const authUtility = chrome.extension.getBackgroundPage().authUtility;
	const flowListener = chrome.extension.getBackgroundPage().flowListener;

	// important elements
	const authPanel = $('#auth-panel');
	const mainPanel = $('#main-panel');
	const listeningStatusPanel = $('#listening-status');
	const flowCounter = $('#flow-count');
	const authorizeButton = $('#button-authorize');
	const startButton = $('#button-start');
	const stopButton = $('#button-stop');

	// show auth panel if not authorized; otherwise show main flow listener panel
	function initPanelVisibility() {
		const isAuthorized = authUtility.getIsAuthorized();
		authPanel.toggleClass('is-hidden', isAuthorized);
		mainPanel.toggleClass('is-hidden', !isAuthorized);
	}
	initPanelVisibility();

	(function initAuthorizationBehavior() {
		authorizeButton.click(function () {
			authUtility.launchInteractiveAuth(
				function () {
					initPanelVisibility();
					startButton.click();
				},
				function () {
					$('#auth-error').removeClass('is-hidden');
				}
			);
		});
	})();

	(function initListenerStatusAndButtons() {
		function refreshListeningStatus(connectionStatus) {
			if (connectionStatus === undefined) {
				connectionStatus = flowListener.getConnectionStatus();
			}
			if (connectionStatus === EventSource.OPEN) {
				flowCounter.text(flowListener.getFlowCount());
			}
			listeningStatusPanel
				.toggleClass('is-listening', connectionStatus === EventSource.OPEN)
				.toggleClass('is-stopped', connectionStatus === EventSource.CLOSED)
				.toggleClass('is-connecting', connectionStatus === EventSource.CONNECTING);
		}
		refreshListeningStatus();

		startButton.click(function () {
			refreshListeningStatus(EventSource.CONNECTING);
			flowListener.start(refreshListeningStatus, refreshListeningStatus);
		});

		stopButton.click(function () {
			refreshListeningStatus(EventSource.CLOSED);
			flowListener.stop();
		});
	})();

	(function initPatternsAndMessages() {
		const addPatternInput = $('#add-pattern-input');
		const patternsList = $('#patterns');
		const patternCounter = $('#pattern-count');

		addPatternInput.keypress(function (event) {
			if (event.which != 13) {
				// don't submit unless [Enter] was pressed
				return;
			}

			const patternText = addPatternInput.val();
			try {
				new RegExp(patternText);
			} catch (e) {
				alert(e);
				return;
			}
			addPatternInput.val('');
			if (flowListener.addPattern(patternText)) {
				createPatternElement(patternText);
				const oldPatternCount = +patternCounter.text();
				patternCounter.text(oldPatternCount + 1);
			}
		});

		patternsList.on('click', '.button-delete-group', function () {
			const patternItem = $(this).closest('.pattern-item');
			const patternText = patternItem.find('.pattern-text').text();
			flowListener.deletePattern(patternText);
			patternItem.remove();
			const oldPatternCount = +patternCounter.text();
			patternCounter.text(oldPatternCount - 1);
		});

		patternsList.on('click', '.button-delete-message', function () {
			const messageItem = $(this).closest('.message-item');
			const messageId = messageItem.data('id');
			const patternText = messageItem.closest('.pattern-item').find('.pattern-text').text();
			flowListener.deletePatternMessage(patternText, messageId);
			messageItem.remove();
		});

		patternsList.on('click', '.message', function () {
			chrome.tabs.update({ url: this.href });
		});

		// init patterns list
		const patterns = flowListener.getPatterns();
		patternCounter.text(patterns.length);
		const messages = flowListener.getPatternMessages();
		patterns.forEach(function (pattern, index) {
			createPatternElement(pattern, messages[pattern]);
		});

		function createPatternElement(patternText, messageList) {
			const patternElement = $('<li class="pattern-item">\
				<div class="pattern">\
				<span class="pattern-text"></span>\
				<a class="button-delete-group" title="delete pattern">&#10006;</a>\
				</div>\
				<ul class="message-container">\
				</ul>\
				</li>');
			patternElement.find('.pattern-text').text(patternText);
			if (messageList) {
				const messageContainer = patternElement.find('.message-container');
				messageList.forEach(function (messageData, index) {
					const messageTime = moment(new Date(messageData.timestamp));
					const message = $('<li class="message-item"></li>').data('id', messageData.id)
						.append($('<a class="button-delete-message" title="dismiss">&#10003;</a>'))
						.append($('<a class="message">').attr('href', messageData.messageUrl).text(messageData.content))
						.append($('<address><time datetime="' + messageTime.toISOString() + '">' + messageTime.fromNow() + '</time></address>')
							.append($('<span class="flow-name"></span>').text(messageData.flowName))
							.append($('<span class="user-name"></span>').text(messageData.user)));
					message.appendTo(messageContainer);
				});
			}
			patternElement.appendTo(patternsList);
		}
	})();

	(function initThreadsAndMessages() {
		const threadsList = $('#threads');
		const threadCounter = $('#thread-count');

		threadsList.on('click', '.button-delete-group', function () {
			const threadItem = $(this).closest('.thread-item');
			const threadId = threadItem.data('id');
			flowListener.deleteThread(threadId);
			threadItem.remove();
			const oldThreadCount = +threadCounter.text();
			threadCounter.text(oldThreadCount - 1);
		});

		threadsList.on('click', '.button-delete-message', function () {
			const messageItem = $(this).closest('.message-item');
			const messageId = messageItem.data('id');
			const threadId = messageItem.closest('.thread-item').data('id');
			flowListener.deleteThreadMessage(threadId, messageId);
			messageItem.remove();
		});

		threadsList.on('click', '.message, .thread-title', function () {
			chrome.tabs.update({ url: this.href });
		});

		// init threads list
		const threads = flowListener.getThreads();
		threadCounter.text(threads.length);
		const messages = flowListener.getThreadMessages();
		threads.forEach(function (thread, index) {
			createthreadElement(thread, messages[thread.id]);
		});

		function createthreadElement(thread, messageList) {
			const threadCreated = moment(new Date(thread.timestamp));
			const threadElement = $('<li class="thread-item"></li>').data('id', thread.id)
				.append($('<div class="thread"></div>')
					.append($('<a class="thread-title"></a>').attr('href', thread.url).attr('title', thread.title).text(thread.title))
					.append($('<address><time datetime="' + threadCreated.toISOString() + '">' + threadCreated.fromNow() + '</time></address>')
						.append($('<span class="flow-name"></span>').text(thread.flowName)))
					.append($('<a class="button-delete-group" title="unsubscribe from thread">&#10006;</a>')))
				.append($('<ul class="message-container"></ul>'));
			if (messageList) {
				const messageContainer = threadElement.find('.message-container');
				messageList.forEach(function (messageData, index) {
					const messageTime = moment(new Date(messageData.timestamp));
					const message = $('<li class="message-item"></li>').data('id', messageData.id)
						.append($('<a class="button-delete-message" title="dismiss">&#10003;</a>'))
						.append($('<a class="message">').attr('href', messageData.messageUrl).text(messageData.content))
						.append($('<address><time datetime="' + messageTime.toISOString() + '">' + messageTime.fromNow() + '</time></address>')
							.append($('<span class="user-name"></span>').text(messageData.user)));
					message.appendTo(messageContainer);
				});
			}
			threadElement.appendTo(threadsList);
		}
	})();

	(function initSectionCollapseBehavior() {
		$('.js-collapsible').prepend(
			$('<a class="list-collapse-toggle is-open" title="Collapse"></a>').click(function () {
				const link = $(this);
				const content = link.nextAll('.js-collapsible-content');
				if (link.hasClass('is-open')) {
					content.hide(400);
					link.attr('title', 'Expand');
				}
				else {
					content.show(400);
					link.attr('title', 'Collapse');
				}
				link.toggleClass('is-open is-closed');
			})
		);
	})();
});

