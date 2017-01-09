define({
	// helper for calling optional callback functions
	call: function (optionalFunction, argsArray) {
		if (typeof optionalFunction === 'function') {
			optionalFunction.apply(null, argsArray);
		}
	},

	// helper to log unexpected responses
	logResponseError: function (request, postData) {
		let message = 'Received ' + request.status + ' ' + request.statusText + ' from ' + request.responseURL;
		if (postData) {
			message += ' with post data: ' + JSON.stringify(postData);
		}
		console.error(message);
	}
});
