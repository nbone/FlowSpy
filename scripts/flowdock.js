// Add "subscribe to thread" link to thread action menu
$(function () {
	// get current list of subscribed threads from background page
	chrome.runtime.sendMessage({ desire: 'getSubscribedThreadIds' }, function (response) {
		if (chrome.runtime.lastError) {
			console.error('Failed to communicate with the background page: ' + JSON.stringify(chrome.runtime.lastError));
		}
		const subscribedThreadIds = response || [];

		// flowdock uses dynamic loading of content and much event interception, meaning:
		// 1. onload is much too early to change the DOM
		// 2. we must bind to the 'body' to avoid losing the binding
		// 3. we use 'mouseenter' instead of 'click' because the latter is intercepted and stopped (in this case)
		// 4. we must re-add the menu item every time the menu is opened, because flowdock destroys and recreates it
		const markerClass = 'flowspy-link-added';
		$('body').on('mouseenter', '.thread-actions:not(.' + markerClass + ')', function () {
			// extract current thread data from the url
			const urlParts = window.location.pathname.match(/([^/]+)\/([^/]+)\/threads\/([^/]+)$/);
			const threadData = {
				organization: urlParts[1],
				flow: urlParts[2],
				threadId: urlParts[3]
			};
			const isSubscribed = subscribedThreadIds.includes(threadData.threadId);

			// create menu item for thread subscription
			const subscribeLink = $('<li class="flowspy-subscribe"></li>)');

			if (isSubscribed) {
				subscribeLink.append($('<a></a>')
					.append($('<i class="icon fa fa-fw"></i>')
						.append($('<img>').attr('src', chrome.extension.getURL('images/icon48.png'))))
					.append(' Subscribed!'));
			}
			else {
				subscribeLink.append($('<a></a>')
					.append($('<i class="icon fa fa-fw"></i>')
						.append($('<img>').attr('src', chrome.extension.getURL('images/icon48.png'))))
					.append(' Subscribe'))
				.click(function (event) {
					chrome.runtime.sendMessage({ desire: 'subscribeToThread', data: threadData }, function (response) {
						if (chrome.runtime.lastError) {
							console.error('Failed to communicate with the background page: ' + JSON.stringify(chrome.runtime.lastError));
						}
					});
				});
			}

			// add new menu item to the DOM
			const container = $(this);
			container.find('.thread-actions-toggle').click(function () {
				setTimeout(function () {
					container.find('.item-action-list').prepend(subscribeLink);
				}, 50);
			});
			container.addClass(markerClass);
		});
	});
});
