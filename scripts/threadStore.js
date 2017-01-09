// subscribed-to threads, and their matching messages
define(function () {
	var threads = [];
	var messagesByThread = {};

	const threadsStorageKey = 'threads';

	function saveToStorage() {
		let data = {};
		data[threadsStorageKey] = JSON.stringify(threads);
		chrome.storage.local.set(data, function () {
			if (chrome.runtime.lastError) {
				console.warn('Failed to save ' + threadsStorageKey + ' in local storage: ' + JSON.stringify(chrome.runtime.lastError));
			} else {
				console.debug('Saved threads: ' + JSON.stringify(data));
			}
		});
	}

	function syncFromStorage() {
		chrome.storage.local.get(threadsStorageKey, function (items) {
			if (chrome.runtime.lastError) {
				console.warn('Failed to get ' + threadsStorageKey + ' from local storage: ' + JSON.stringify(chrome.runtime.lastError));
				return;
			}
			threads = JSON.parse(items[threadsStorageKey] || '[]');
			threads.forEach(function (thread, index) {
				if (!messagesByThread[thread.id]) {
					messagesByThread[thread.id] = [];
				}
			});
		});
	}

	// on init, immediately load any saved threads from storage
	syncFromStorage();

	return {
		getThreads: function () {
			return threads;
		},

		getMessages: function () {
			return messagesByThread;
		},

		addThread: function (threadData) {
			// no-op if already present
			const hasThread = threads.some(function (thread) {
				return thread.id === threadData.id;
			});
			if (hasThread) {
				return false;
			}

			threads.push(threadData);
			saveToStorage();

			if (!messagesByThread[threadData.id]) {
				messagesByThread[threadData.id] = [];
			}

			return true;
		},

		deleteThread: function (threadId) {
			const index = threads.findIndex(function (thread) {
				return thread.id === threadId;
			});
			if (index !== -1) {
				threads.splice(index, 1);
				saveToStorage();
				messagesByThread[threadId] = null;
			}
		},

		addMessage: function (threadId, messageData) {
			messagesByThread[threadId].push(messageData);
		},

		deleteMessage: function (threadId, messageId) {
			if (!messagesByThread[threadId]) {
				console.error('Tried to delete message for nonexistent thread. MessageId: ' + messageId + ' ThreadId: ' + threadId);
				return;
			}
			for (var index = messagesByThread[threadId].length - 1; index >= 0; index--) {
				if (messagesByThread[threadId][index].id === messageId) {
					messagesByThread[threadId].splice(index, 1);
					return;
				}
			}
		}
	};
});
