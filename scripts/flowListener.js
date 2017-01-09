// the meat of the app; listens to flow messages and records pattern matches
define(['util', 'auth', 'icon', 'patternStore', 'threadStore'], function (util, auth, icon, patternStore, threadStore) {
	var stream = null;
	var isPaused = false;
	var flowDataById = {};
	var userDataById = {};
	
	const storageKeys = {
		isPaused: 'isPaused'
	};

	// when stream is active, ALL flow messages will pass through this function
	function handleMessage(message) {
		if (isPaused) {
			return;
		}
//		console.debug('Heard message: ' + JSON.stringify(message));
		if (!message.event || message.event != 'message') {
			// ignore edits, tags, and other non-posts
			return;
		}
		if (!message.content) {
			console.warn('Message has no content!');
			return;
		}

		let isMatch = false;

		// test subscribed threads
		if (threadStore.getThreads().some(function (thread) {
			return thread.id === message.thread_id;
		})) {
			threadStore.addMessage(message.thread_id, repackageMessageData(message));
			isMatch = true;
		}

		// test patterns
		patternStore.getPatterns().forEach(function (pattern, index) {
			// ASSUME patterns are all valid RegExps
			if (pattern.test(message.content)) {
				patternStore.addMessage(pattern.source, repackageMessageData(message));
				isMatch = true;
			}
		});

		if (isMatch) {
			displayMessageCount();
			chrome.notifications.create('flowSpy toast', {
				type: 'basic',
				iconUrl: 'images/icon48.png',
				title: getUserHandle(message.user) + ' - ' + flowDataById[message.flow].name,
				message: message.content,
				eventTime: message.sent
			})
		}
	}

	function repackageMessageData(message) {
		return {
			id: message.id,
			content: message.content,
			// WARNING: this URL is not guaranteed and flowdock may break it without warning
			messageUrl: flowDataById[message.flow].url + '/threads/' + message.thread_id +
				'#thread-message-' + message.flow + '-' + message.id,
			flowName: flowDataById[message.flow].name,
			timestamp: message.sent,
			user: getUserHandle(message.user)
		};
	}

	function startStream(accessToken, onSuccess, onFailure) {
		console.debug('Starting stream...');
		// TODO: configure which flows to listen to? for now listen to all
		const flowList = Object.getOwnPropertyNames(flowDataById).join(',');
		const streamUri = 'https://stream.flowdock.com/flows?filter=' + flowList + '&access_token=' + accessToken;
		createStream(streamUri);
		// poll connection state until success or failure
		const verifyConnectionTimer = setInterval(function () {
			console.debug('Verify connection stream.readyState = ' + stream.readyState);
			if (isPaused) {
				// user canceled connection request
				clearInterval(verifyConnectionTimer);
				return;
			}
			else if (stream.readyState === EventSource.OPEN) {
				clearInterval(verifyConnectionTimer);

				// check stream state every minute and attempt restart if it closes
				const keepAliveTimer = setInterval(function () {
					console.debug('Keep-alive stream.readyState = ' + stream.readyState);
					if (isPaused) {
						// user stopped stream
						clearInterval(keepAliveTimer);
						return;
					}
					else if (stream.readyState === EventSource.CLOSED) {
						// startStream will restart this keep-alive on success, so cancel timer for now
						clearInterval(keepAliveTimer);
						startStream(accessToken);
					}
				}, 60000);

				util.call(onSuccess);
			}
			else if (stream.readyState === EventSource.CLOSED) {
				clearInterval(verifyConnectionTimer);

				// stream closed immediately; check response status
				// Unfortunately EventSource does not expose response info, and doesn't even fire onerror in this case,
				// so issue another request purely for diagnostic purposes
				const request = new XMLHttpRequest();
				request.onload = function () {
					if (request.status === 401) {
						// need to re-auth
						console.debug('Got 401 from ' + streamUri + '; attempting re-auth.');
						auth.refreshAuth(
							function (accessToken) {
								startStream(accessToken, onSuccess, onFailure);
							},
							onFailure
							);
					}
					else {
						// no other known failure cases that we can do anything about
						util.logResponseError(request);
						util.call(onFailure);
					}
				};
				request.open('GET', streamUri);
				request.send();
			}
		}, 100);
	}

	function createStream(streamUri) {
		stream = new EventSource(streamUri, { withCredentials: true });
		stream.onmessage = function (message) {
			handleMessage(JSON.parse(message.data));
		};
		stream.onerror = function (error) {
			// errors are typically network disconnections and don't need special handling; the keep-alive logic above will help us recover when we reconnect
			console.warn('stream error: ' + JSON.stringify(error));
		}
	}

	function getFlows(accessToken, onSuccess, onFailure) {
		getAuthenticatedResourceWithAccessToken('https://api.flowdock.com/flows?users=0&access_token=', accessToken, onSuccess, onFailure);
	}

	function getUsers(accessToken, onSuccess, onFailure) {
		getAuthenticatedResourceWithAccessToken('https://api.flowdock.com/users?access_token=', accessToken, onSuccess, onFailure);
	}

	function getAuthenticatedResourceWithAccessToken(uriPrefix, accessToken, onSuccess, onFailure) {
		const request = new XMLHttpRequest();
		request.onload = function () {
			if (request.status === 200) {
				onSuccess(request.response);
			}
			else {
				util.logResponseError(request);
				if (request.status === 401) {
					// need to re-auth
					console.debug('Got 401 from flowdock api; attempting re-auth.');
					auth.refreshAuth(
						function (accessToken) {
							getAuthenticatedResourceWithAccessToken(uriPrefix, accessToken, onSuccess, onFailure);
						},
						onFailure
						);
				}
				else {
					util.call(onFailure);
				}
			}
		};
		request.open('GET', uriPrefix + accessToken, true);
		request.send();
	}

	function saveFlowData(flowsJson) {
		flowsList = JSON.parse(flowsJson);
		flowsList.forEach(function (flow, index) {
			flowDataById[flow.id] = {
				url: flow.web_url,
				name: flow.name
			};
		});
		console.debug('Found ' + flowsList.length + ' flows.');
	}

	function saveUserData(usersJson) {
		usersList = JSON.parse(usersJson);
		usersList.forEach(function (user, index) {
			userDataById[user.id] = {
				handle: user.nick,
				fullName: user.name
			};
		});
		console.debug('Found ' + usersList.length + ' users.');
	}

	function getUserHandle(userId) {
		if (!userDataById) {
			throw 'called getUserHandle when user data is uninitialized';
		}
		const user = userDataById[userId];
		if (user) {
			return user.handle || user.fullName || userId;
		}
		return userId;
	}

	function setIsPaused(value) {
		if (!isPaused === !value) {
			return;
		}
		isPaused = !!value;
		let data = {};
		data[storageKeys.isPaused] = isPaused;
		chrome.storage.local.set(data, function () {
			if (chrome.runtime.lastError) {
				console.error('Failed to save "paused" state to local storage: ' + JSON.stringify(chrome.runtime.lastError));
			}
			else {
				// update extension icon if needed
				icon.setIsPaused(isPaused);
			}
		});
	}

	function displayMessageCount() {
		let count = 0;
		const patternMessages = patternStore.getMessages();
		for (var key in patternMessages) {
			if (patternMessages.hasOwnProperty(key)) {
				count += (patternMessages[key] || []).length;
			}
		}
		const threadMessages = threadStore.getMessages();
		for (var key in threadMessages) {
			if (threadMessages.hasOwnProperty(key)) {
				count += (threadMessages[key] || []).length;
			}
		}
		if (count > 0) {
			chrome.browserAction.setBadgeBackgroundColor({ color: '#e71' });
			chrome.browserAction.setBadgeText({ text: count + '' });
		} else {
			chrome.browserAction.setBadgeText({ text: '' });
		}
	}

	function getAccessTokenAndRefreshFlowData(onSuccess, onFailure) {
		auth.getAccessToken(
			function (accessToken) {
				getFlows(accessToken,
					function (flowsJson) {
						saveFlowData(flowsJson);
						getUsers(accessToken,
							function (usersJson) {
								saveUserData(usersJson);
								util.call(onSuccess, [accessToken]);
							},
							onFailure);
					},
					onFailure);
			},
			onFailure);
	};

	function refreshFlowDataAndStartStream(onSuccess, onFailure) {
		if (stream && stream.readyState !== EventSource.CLOSED) {
			console.debug('trying to start when stream is not CLOSED; state: ' + stream.readyState);
			return;
		}
		setIsPaused(false);
		getAccessTokenAndRefreshFlowData(
			function (accessToken) {
				startStream(accessToken, onSuccess, onFailure);
			},
			onFailure);
	};

	// on init, load desired "paused" state, and if we're supposed to be listening but we're not then restart
	chrome.storage.local.get(storageKeys.isPaused, function (items) {
		if (chrome.runtime.lastError) {
			console.warn('Failed to get "paused" state from local storage: ' + JSON.stringify(chrome.runtime.lastError));
			return;
		}
		const isPausedValue = items[storageKeys.isPaused];
		setIsPaused(isPausedValue);
		if (isPausedValue === false && (!stream || stream.readyState === EventSource.CLOSED)) {
			refreshFlowDataAndStartStream();
		}
	});

	// also refresh message count
	displayMessageCount();

	return {
		start: function (onSuccess, onFailure) {
			refreshFlowDataAndStartStream(onSuccess, onFailure);
		},

		stop: function () {
			console.debug('Stopping stream...');
			if (isPaused) {
				console.debug('trying to stop when already stopped.');
				return;
			}
			setIsPaused(true);
			stream.close();
		},

		getConnectionStatus: function () {
			return stream ? stream.readyState : EventSource.CLOSED;
		},

		getFlowCount: function () {
			if (!flowDataById) {
				throw 'called getFlowCount when flow data is uninitialized';
			}
			return Object.getOwnPropertyNames(flowDataById).length;
		},

		getPatterns: function () {
			return patternStore.getPatternsText();
		},

		getPatternMessages: function () {
			return patternStore.getMessages();
		},

		addPattern: function (patternText) {
			return patternStore.addPattern(patternText);
		},

		deletePattern: function (patternText) {
			patternStore.deletePattern(patternText);
			displayMessageCount();
		},

		deletePatternMessage: function (patternText, messageId) {
			patternStore.deleteMessage(patternText, messageId);
			displayMessageCount();
		},

		getThreads: function () {
			return threadStore.getThreads();
		},

		getThreadMessages: function () {
			return threadStore.getMessages();
		},

		addThread: function (organization, flow, threadId) {
			function onFailure() {
				console.error('Failed to addThread(' + organization + ', ' + flow + ', ' + threadId + ')');
			}

			// fetch requisite thread data from the flowdock API before saving
			getAccessTokenAndRefreshFlowData(
				function (accessToken) {
					getAuthenticatedResourceWithAccessToken(
						'https://api.flowdock.com/flows/' + organization + '/' + flow + '/threads/' + threadId + '/messages?limit=1&sort=asc&access_token=',
						accessToken,
						function (messagesJson) {
							const message = JSON.parse(messagesJson)[0];
							const threadData = {
								id: threadId,
								title: message.thread.title,
								flowName: flowDataById[message.flow].name,
								timestamp: message.sent,
								user: getUserHandle(message.user),
								url: flowDataById[message.flow].url + '/threads/' + threadId
							};
							threadStore.addThread(threadData);
						},
						onFailure);
				},
				onFailure);
		},

		deleteThread: function (threadId) {
			threadStore.deleteThread(threadId);
			displayMessageCount();
		},

		deleteThreadMessage: function (threadId, messageId) {
			threadStore.deleteMessage(threadId, messageId);
			displayMessageCount();
		}
	};
});
