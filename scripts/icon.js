define(function () {
	// icon variants to display in the browser
	const icons = {
		default: 'images/icon48.png',
		paused: 'images/paused48.png',
		unauthorized: 'images/unauth48.png'
	};
	let state = {
		isAuthorized: true,
		isPaused: false,
		icon: icons.default
	};

	function setIcon() {
		const newIcon = !state.isAuthorized ? icons.unauthorized
			: state.isPaused ? icons.paused
			: icons.default;

		if (newIcon === state.icon) {
			return;
		}

		state.icon = newIcon;
		chrome.browserAction.setIcon({ path: state.icon });
	}

	return {
		setIsAuthorized: function (isAuthorized) {
			state.isAuthorized = isAuthorized;
			setIcon();
		},

		setIsPaused: function (isPaused) {
			state.isPaused = isPaused;
			setIcon();
		}
	};
});
