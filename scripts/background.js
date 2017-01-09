require.config({
	baseUrl: 'scripts'
});

require(['auth', 'flowListener'], function (auth, flow) {
	// expose these globally so popup can get them via chrome.extension.getBackgroundPage()
	authUtility = auth;
	flowListener = flow;

	// scroll text across the extension's badge, then restore the previous badge state
	function marquee(text, backgroundColor, scrollDelay) {
		chrome.browserAction.getBadgeText({}, function (saveBadgeText) {
			chrome.browserAction.getBadgeBackgroundColor({}, function (saveBackgroundColor) {
				chrome.browserAction.setBadgeBackgroundColor({ color: backgroundColor });

				const timer = setInterval(function () {
					chrome.browserAction.setBadgeText({ text: text });
					text = text.slice(1);

					if (text.length === 0) {
						clearInterval(timer);
						chrome.browserAction.setBadgeBackgroundColor({ color: saveBackgroundColor });
						chrome.browserAction.setBadgeText({ text: saveBadgeText });
					}
				}, scrollDelay);
			});
		});
	}

	// handle messages from content script
	chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
		if (!message || !message.desire) {
			return false;
		}

		switch (message.desire) {
			case 'subscribeToThread':
				flowListener.addThread(message.data.organization, message.data.flow, message.data.threadId);
				marquee('   Subscribed!   ', '#3a2', 125);
				break;

			case 'getSubscribedThreadIds':
				const threadIds = flowListener.getThreads().map(function (thread) {
					return thread.id;
				});
				sendResponse(threadIds);
				break;

			default:
				return false;
		}

		return true;
	});
});
