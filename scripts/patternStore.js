// configured regex patterns, and their matching messages
define(function () {
	var patterns = [];
	var messagesByPattern = {};

	const patternsStorageKey = 'patterns';

	function saveToStorage() {
		let data = {};
		data[patternsStorageKey] = getPatternsText();
		chrome.storage.local.set(data, function () {
			if (chrome.runtime.lastError) {
				console.warn('Failed to save ' + patternsStorageKey + ' in local storage: ' + JSON.stringify(chrome.runtime.lastError));
			} else {
				console.debug('Saved patterns: ' + JSON.stringify(data));
			}
		});
	}

	function syncFromStorage() {
		chrome.storage.local.get(patternsStorageKey, function (items) {
			if (chrome.runtime.lastError) {
				console.warn('Failed to get ' + patternsStorageKey + ' from local storage: ' + JSON.stringify(chrome.runtime.lastError));
				return;
			}
			patterns = (items[patternsStorageKey] || []).map(function (patternText) {
				// treat all patterns as case-insensitive RegExps
				return new RegExp(patternText, 'i');
			}) || [];
			patterns.forEach(function (pattern, index) {
				if (!messagesByPattern[pattern.source]) {
					messagesByPattern[pattern.source] = [];
				}
			});
		});
	}

	function getPatternsText() {
		return patterns.map(function (patternRegExp) {
			return patternRegExp.source;
		});
	}

	// on init, immediately load any saved patterns from storage
	syncFromStorage();

	return {
		getPatterns: function () {
			return patterns;
		},

		getPatternsText: function () {
			return getPatternsText();
		},

		getMessages: function () {
			return messagesByPattern;
		},

		addPattern: function (patternText) {
			// treat all patterns as case-insensitive RegExps
			const patternRegExp = new RegExp(patternText, 'i');

			// no-op if already present
			if (patterns.includes(patternRegExp)) {
				return false;
			}

			patterns.push(patternRegExp);
			saveToStorage();

			if (!messagesByPattern[patternText]) {
				messagesByPattern[patternText] = [];
			}

			return true;
		},

		deletePattern: function (patternText) {
			const index = getPatternsText().indexOf(patternText);
			if (index !== -1) {
				patterns.splice(index, 1);
				saveToStorage();
				messagesByPattern[patternText] = null;
			}
		},

		addMessage: function (patternText, messageData) {
			messagesByPattern[patternText].push(messageData);
		},

		deleteMessage: function (patternText, messageId) {
			if (!messagesByPattern[patternText]) {
				console.error('Tried to delete message for nonexistent pattern. MessageId: ' + messageId + ' Pattern: ' + patternText);
				return;
			}
			for (var index = messagesByPattern[patternText].length - 1; index >= 0; index--) {
				if (messagesByPattern[patternText][index].id === messageId) {
					messagesByPattern[patternText].splice(index, 1);
					return;
				}
			}
		}
	};
});
