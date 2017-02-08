'use strict';

var AbstractChannel = require('kevoree-entities/lib/AbstractChannel');
var WebSocket = require('ws');
var RWebSocket = require('rwebsocket');

/**
 * Kevoree channel
 * @type {RemoteWSChan}
 */
var RemoteWSChan = AbstractChannel.extend({
	toString: 'RemoteWSChan',
	tdef_version: 1,

	dic_host: {
		optional: false
	},
	dic_port: {
		optional: true,
		defaultValue: 80
	},
	dic_path: {
		optional: true,
		defaultValue: '/'
	},
	dic_uuid: {
		optional: false
	},


	construct: function () {
		this.uri = null;
		this.clients = {};
	},

	start: function (done) {
		var self = this;
		self.processURI(function (err, uri) {
			if (err) {
				done(err);
			} else {
				self.uri = uri;
				self.getLocalInputPorts().forEach(function (input) {
					var topic = uri + input.path;
					var client = new RWebSocket(topic);
					self.clients[topic] = client;
					client.onopen = function () {
						self.log.debug(self.toString(), self.name + ' listening on topic "' + topic + '"');
					};
					client.onmessage = function (event) {
						self.localDispatch(event.data);
					};
					client.onerror = function (evt) {
						self.log.warn(self.toString(), evt);
					};
					client.onclose = function (event) {
						if (event.code === 1000) {
							self.log.debug(self.toString(), self.name + ' closed connection with topic "' + topic + '"');
						} else {
							self.log.warn(self.toString(), self.name + ' lost connection with topic "' + topic + '"');
						}
					};
					client.connect();
				});
				done();
			}
		});
	},

	stop: function (done) {
		var self = this;
		this.uri = null;

		Object.keys(this.clients)
			.forEach(function (key) {
				try {
					self.clients[key].close(1000);
				} catch (ignore) {
					console.log(ignore); // eslint-disable-line
					// ignore errors we just want the connection to close
				}
				delete self.clients[key];
			});

		done();
	},

	update: function (done) {
		var self = this;
		self.stop(function (err) {
			if (err) {
				done(err);
			} else {
				self.start(done);
			}
		});
	},

	/**
	 * When a channel is bound with an output port this method will be called when a message is sent
	 *
	 * @param fromPortPath port that sends the message
	 * @param destPortPaths port paths of connected input port that should receive the message
	 * @param msg
	 */
	onSend: function (fromPortPath, destPortPaths, msg) {
		var self = this;
		destPortPaths.forEach(function (dest) {
			var client = new WebSocket(self.uri + dest);
			client.onopen = function () {
				this.send(msg + '');
				this.close();
			};
			client.onerror = function noop() {};
			client.onclose = function (event) {
				if (event.code !== 1000) {
					self.log.warn(self.toString(), self.name + ' unable to connect to topic ' + self.uri + dest);
				}
			};
		});
	},

	processURI: function (done) {
		var host = this.dictionary.getString('host'),
			port = this.dictionary.getNumber('port', RemoteWSChan.prototype.dic_port.defaultValue),
			uuid = this.dictionary.getString('uuid'),
			path = this.dictionary.getString('path', RemoteWSChan.prototype.dic_path.defaultValue);

		if (!host) {
			done(new Error('"host" attribute is not specified'));
			return;
		}

		if (!uuid) {
			done(new Error('"uuid" attribute is not specified'));
			return;
		}

		if (uuid.match(/\//g) !== null) {
			done(new Error('"uuid" attribute must not contain slashes ("/")'));
			return;
		}

		if (path.substr(0, 1) === '/') {
			// remove slash at the beginning
			path = path.substr(1, path.length);
		}

		if (path.length > 0 && path.substr(path.length - 1, 1) === '/') {
			// remove slash at the end
			path = path.substr(0, path.length - 2);
		}

		if (path.length > 0) {
			done(null, 'ws://' + host + ':' + port + '/' + path + '/' + uuid);
		} else {
			done(null, 'ws://' + host + ':' + port + '/' + uuid);
		}
	}
});

module.exports = RemoteWSChan;
