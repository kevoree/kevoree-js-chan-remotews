'use strict';

var AbstractChannel = require('kevoree-entities/lib/AbstractChannel');
var WebSocket = require('ws');
var noop = function() {};

/**
 * Kevoree channel
 * @type {RemoteWSChan}
 */
var RemoteWSChan = AbstractChannel.extend({
  toString: 'RemoteWSChan',
  tdef_version: 1,

  dic_host: { optional: false },
  dic_port: { optional: true, defaultValue: 80 },
  dic_path: { optional: true, defaultValue: '/' },
  dic_uuid: { optional: false },

  construct: function() {
    this.uri = null;
    this.senders = {};
    this.receiversTimeout = [];
  },

  start: function(done) {
    this.processURI(function(err, uri) {
      if (err) {
        done(err);
      } else {
        this.uri = uri;
        this.getInputs().forEach(function(path) {
          var timeout;
          var reconnect = function() {
            clearTimeout(timeout);
            this.receiversTimeout.splice(this.receiversTimeout.indexOf(timeout), 1);
            timeout = setTimeout(createClient, 3000);
            this.receiversTimeout.push(timeout);
          }.bind(this);

          var createClient = function() {
            var client = new WebSocket(this.uri + path);
            client.on('open', function() {
              clearTimeout(timeout);
              this.receiversTimeout.splice(this.receiversTimeout.indexOf(timeout), 1);
            }.bind(this));
            client.on('message', function(msg) {
              this.localDispatch(msg.type
                ? msg.data
                : msg);
            }.bind(this));
            client.on('close', reconnect);
            client.on('error', reconnect);
          }.bind(this);
          createClient();
        }.bind(this));
        done();
      }
    }.bind(this));
  },

  stop: function(done) {
    this.uri = null;

    Object.keys(this.senders).forEach(function(key) {
      this.senders[key].close();
      delete this.senders[key];
    }.bind(this));

    this.receiversTimeout.forEach(function(timeout) {
      clearTimeout(timeout);
    });

    this.receiversTimeout.length = 0;

    done();
  },

  update: function(done) {
    this.stop(function(err) {
      if (err) {
        done(err);
      } else {
        this.start(done);
      }
    }.bind(this));
  },

  /**
    * When a channel is bound with an output port this method will be called when a message is sent
    *
    * @param fromPortPath port that sends the message
    * @param destPortPaths port paths of connected input port that should receive the message
    * @param msg
    */
  onSend: function(fromPortPath, destPortPaths, msg) {
    destPortPaths.forEach(function(dest) {
      var client = this.senders[this.uri + dest];
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(msg + '');
      } else {
        client = new WebSocket(this.uri + dest);
        client.on('open', function() {
          this.senders[this.uri + dest] = client;
          client.send(msg + '');
        }.bind(this));
        client.on('error', noop);
        client.on('close', noop);
      }
    }.bind(this));
  },

  processURI: function(done) {
    var host = this.dictionary.getString('host'),
      port = this.dictionary.getNumber('port', 80),
      uuid = this.dictionary.getString('uuid'),
      path = this.dictionary.getString('path', '');

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
