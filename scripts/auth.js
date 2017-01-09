// functions for handling authentication with flowdock
define(['util', 'client', 'icon'], function (util, client, icon) {
	var isAuthorized = false;
	var refreshTokenTimer = null;

	const storageKeys = {
		accessToken: 'accessToken',
		refreshToken: 'refreshToken',
		expirationDate: 'expirationDate'
	};

	// Generates a random token to protect against CSRF when obtaining authorization
	function generateAntiCsrfToken() {
		let bytes = new Uint8Array(8);
		window.crypto.getRandomValues(bytes);
		return btoa(bytes).slice(0, 24);
	}

	function getQueryStringValue(uri, key) {
		const regex = new RegExp('[?&]' + key + '=([^&]*)');
		const matches = uri.match(regex);
		return matches ? matches[1] : null;
	}

	function getAuthCodeFromUri(uri, antiCsrfToken) {
		const state = getQueryStringValue(uri, 'state');
		if (state !== antiCsrfToken) {
			console.error('Unexpected "state" value in query string. Expected: "' + antiCsrfToken + '"; received: "' + state + '".');
			return null;
		}
		const authCode = getQueryStringValue(uri, 'code');
		if (!authCode) {
			console.error('Missing "code" value in query string: ' + uri);
		}
		return authCode;
	}

	function requestAndSaveAuthTokens(postData, onSuccess, onFailure) {
		const oauthUri = 'https://api.flowdock.com/oauth/token';
		const request = new XMLHttpRequest();
		request.onload = function () {
			if (request.status !== 200) {
				util.logResponseError(request, postData);
			}
			if (request.status >= 400) {
				setIsAuthorized(false);
				util.call(onFailure);
			} else {
				saveAuthTokens(request.response, onSuccess, onFailure);
			}
		};
		request.open('POST', oauthUri);
		request.setRequestHeader('Accept', 'application/json');
		request.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
		request.send(JSON.stringify(postData));
	}

	function saveAuthTokens(authJson, onSuccess, onFailure) {
		let authData;
		try {
			authData = JSON.parse(authJson);
		} catch (ex) {
			console.error('Failed to parse authentication response: ' + authJson);
			util.call(onFailure);
			return;
		}

		const accessToken = authData.access_token;
		const refreshToken = authData.refresh_token;
		const expirySeconds = authData.expires_in;
		if (!accessToken || !refreshToken || !expirySeconds) {
			console.error('Expected authentication data not found in response: ' + authJson);
			util.call(onFailure);
			return;
		}

		// set an earlier than actual expiration date so we have time to refresh the tokens before losing access
		let expDate = new Date();
		expDate.setSeconds(expDate.getSeconds() + Math.floor(0.8 * expirySeconds));

		let data = {};
		data[storageKeys.accessToken] = accessToken;
		data[storageKeys.refreshToken] = refreshToken;
		data[storageKeys.expirationDate] = expDate.getTime();
		chrome.storage.local.set(data, function () {
			if (chrome.runtime.lastError) {
				console.error('Failed to save auth tokens in local storage: ' + JSON.stringify(chrome.runtime.lastError));
				setIsAuthorized(false);
				util.call(onFailure);
			} else {
				setIsAuthorized(true);
				util.call(onSuccess, [accessToken]);
			}
		});

		// automatically refresh upon expiry
		clearTimeout(refreshTokenTimer);
		scheduleRefresh(refreshToken, expDate);
	}

	function scheduleRefresh(refreshToken, expirationDate) {
		const now = new Date();
		if (refreshToken && expirationDate) {
			// setTimeout delay is signed 32-bit int, so cap maximum delay
			const delay = Math.min(Math.max(expirationDate - now, 0), 0x7FFFFFFF);
			refreshTokenTimer = setTimeout(function () {
				console.debug('Refreshing auth tokens due to impending expiration (exp: ' + JSON.stringify(expirationDate) + ').');
				const postData = {
					client_id: client.clientId,
					client_secret: client.clientSecret,
					refresh_token: refreshToken,
					grant_type: 'refresh_token'
				};
				requestAndSaveAuthTokens(postData);
			}, delay);
		}
	}

	function setIsAuthorized(value) {
		if (!isAuthorized === !value) {
			return;
		}
		isAuthorized = !!value;

		// update extension icon if needed
		icon.setIsAuthorized(isAuthorized);
	}

	// onload, if we have a refreshToken and expiry on file, then schedule a task to refresh the auth tokens
	chrome.storage.local.get([storageKeys.refreshToken, storageKeys.expirationDate], function (items) {
		if (chrome.runtime.lastError) {
			console.error('Failed to get refresh token and expiry from local storage: ' + JSON.stringify(chrome.runtime.lastError));
		} else if (!items || !items[storageKeys.refreshToken] || !items[storageKeys.expirationDate]) {
			// not authorized
			setIsAuthorized(false);
			console.debug('Refresh token or expiration date not found in local storage (probably not yet authorized).');
		} else {
			setIsAuthorized(true); // assume; otherwise we wouldn't have tokens in storage
			const refreshToken = items[storageKeys.refreshToken];
			const expirationDate = new Date(items[storageKeys.expirationDate]);
			scheduleRefresh(refreshToken, expirationDate);
		}
	});

	return {
		getIsAuthorized: function () {
			return isAuthorized;
		},

		launchInteractiveAuth: function (onSuccess, onFailure) {
			const antiCsrfToken = generateAntiCsrfToken();
			const authUri = 'https://api.flowdock.com/oauth/authorize?client_id='
				+ client.clientId
				+ '&response_type=code&scope=flow&redirect_uri='
				+ chrome.identity.getRedirectURL('flowdock')
				+ '&state='
				+ antiCsrfToken;

			chrome.identity.launchWebAuthFlow(
				{'url': authUri, 'interactive': true},
				function (redirectUri) {
					if (chrome.runtime.lastError) {
						console.error('Interactive auth failed; probably user canceled or denied permission: ' + JSON.stringify(chrome.runtime.lastError));
						util.call(onFailure);
						return;
					}
					const authCode = getAuthCodeFromUri(redirectUri, antiCsrfToken);
					if (!authCode) {
						util.call(onFailure);
						return;
					}
					const postData = {
						client_id: client.clientId,
						client_secret: client.clientSecret,
						code: authCode,
						redirect_uri: chrome.identity.getRedirectURL('flowdock'),
						grant_type: 'authorization_code'
					};
					requestAndSaveAuthTokens(postData, onSuccess, onFailure);
				});
		},

		refreshAuth: function (onSuccess, onFailure) {
			chrome.storage.local.get(storageKeys.refreshToken, function (items) {
				if (chrome.runtime.lastError) {
					console.error('Failed to get refresh token from local storage: ' + JSON.stringify(chrome.runtime.lastError));
					util.call(onFailure);
				} else if (!items || !items[storageKeys.refreshToken]) {
					console.error('Refresh token not found in local storage.');
					util.call(onFailure);
				} else {
					const postData = {
						client_id: client.clientId,
						client_secret: client.clientSecret,
						refresh_token: items[storageKeys.refreshToken],
						grant_type: 'refresh_token'
					};
					requestAndSaveAuthTokens(postData, onSuccess, onFailure);
				}
			});
		},

		getAccessToken: function (onSuccess, onFailure) {
			chrome.storage.local.get(storageKeys.accessToken, function (items) {
				if (chrome.runtime.lastError) {
					console.error('Failed to get access token from local storage: ' + JSON.stringify(chrome.runtime.lastError));
					util.call(onFailure);
				} else if (!items || !items[storageKeys.accessToken]) {
					console.error('Access token not found in local storage.');
					util.call(onFailure);
				} else {
					util.call(onSuccess, [items[storageKeys.accessToken]]);
				}
			});
		}
	};
});
