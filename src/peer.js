/*
 * Copyright 2015 Paradone
 *
 * This file is part of Paradone <https://paradone.github.io>
 *
 * Paradone is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Paradone is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Paradone.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @flow weak
 */
'use strict'

import MessageEmitter from './messageEmitter.js'
import PeerConnection from './peerConnection.js'
import Signal from './signal.js'
import { contains, containsMatch, messageIsValid } from './util.js'
import * as extensions from './extensions/list.js'
import { partition } from 'ramda'
export default Peer

/**
 * @external RTCIceCandidate
 * @see https://w3c.github.io/webrtc-pc/#rtcicecandidate-type
 */
var RTCIceCandidate =
    window.RTCIceCandidate ||
    window.mozRTCIceCandidate
/**
 * @external RTCSessionDescription
 * @see https://w3c.github.io/webrtc-pc/#rtcsessiondescription-class
 */
var RTCSessionDescription =
    window.RTCSessionDescription ||
    window.mozRTCSessionDescription ||
    window.webkitRTCSessionDescription

/**
 * A peer holds the information for connections with the mesh, and info about
 * possessed files. It communicates with other peers through a messaging system.
 * Local objects can subscribe to message event with the `on`function and send
 * messages with the `emit` function.
 *
 * @class Peer
 * @implements {MessageEmitter}
 * @param {Object} options - Configuration options
 *
 * @property {string} id - Id of the peer
 * @property {Map.<PeerConnection>} connections - Connections indexed by remote
 *           peer id
 * @property {Map.<Set.<external:RTCIceCandidate>>} icecandidates - Store
 *           ICECandidates for a connection if it's not active yet
 * @property {Object} options - Configuration options passed during
 *           initialization
 * @property {number} ttl - `Time To Live' of a message
 * @property {Array.<Message>} queue - Message queue
 */
function Peer(options) {
  if(!(this instanceof Peer)) {
    // Namespace guard
    return new Peer(options)
  }

  MessageEmitter.call(this)

  if(typeof options !== 'undefined') {

    if(options.hasOwnProperty('extensions')) {
      extensions.apply(this, options.extensions)
    }

    if(options.hasOwnProperty('peer')) {

      if(options.peer.hasOwnProperty('ttl')) {
        Peer.ttl = options.peer.ttl
      }

      if(options.hasOwnProperty('queueTimeout')) {
        Peer.queueTimeout = options.peer.queueTimeout
      }
    }
  }

  // Set signaling system
  var signal = new Signal(this, options.signal)

  // Will hold the peers when a connection is created
  this.connections = new Map()
  this.icecandidates = new Map()
  this.ttl = Peer.ttl
  this.queue = []
  this.options = options

  this.connections.set('signal', signal)
  window.setInterval(processQueue.bind(this), Peer.queueTimeout)

  // Message Handlers
  this.on('offer', onoffer)
  this.on('answer', onanswer)
  this.on('icecandidate', onicecandidate)
  this.on('request-peer', onrequestpeer)
  this.on('first-view', onfirstview)
  this.on('connected', onconnected)
}

Peer.prototype = Object.create(MessageEmitter.prototype)

/**
 * Maximum `time to live' for a message forwarded on the p2p network
 *
 * @name Peer.ttl
 * @type {number}
 */
Peer.ttl = 3

/**
 * Queue check timeout
 *
 * @name Peer.queueTimeout
 * @type {number}
 */
Peer.queueTimeout = 1000

/**
 * Type of messages allowed to be broadcasted on the orverlay or relayed through
 * the Signal
 *
 * @name Peer.forwardableTypes
 * @type {Array.<string>}
 */
Peer.forwardableTypes = ['icecandidate', 'request-peer', 'offer', 'answer']

/**
 * Send a message to multiple peers when the recipient is not directly connected
 * to the peer
 *
 * @function Peer#broadcast
 * @param {Message} message - Message to be broadcasted
 * @return {boolean} Succes or failure of the broadcast
 */
Peer.prototype.broadcast = function(message) {

  let from = message.forwardBy.slice() || []
  let targets = 0

  from.push(message.from)

  // Get all open connections which have not received the message yet
  this.connections.forEach(function(connection, remoteId) {
    // Do not send to signal and nodes that already had this message
    // Do not send the message to nodes that forwarded it
    if(remoteId !== 'signal' &&
       !contains(remoteId, from) &&
       connection.status === 'open') {
      connection.send(message)
      targets += 1
    }
  })

  // No neighbour for broadcast and the message is from the peer: we try to send
  // it through the signal
  if(targets === 0 && message.from === this.id) {
    if(this.connections.has('signal') &&
       this.connections.get('signal').status === 'open') {
      // Signal is available
      this.connections.get('signal').send(message)
    } else {
      // The peer needs to reconnect to the Signal
      this.connections.set('signal', new Signal(this, this.options.signal))
      // Store it in queue while we wait for a response a Signal
      return false
    }
  }
  return true
}

/**
 * Use the connections to send a message to a remote peer.
 * Two solutions: The peer has the recipient as neighbour or we need to
 * broadcast the message.
 *
 * @function Peer#send
 * @param {Message} message - information to be sent
 * @param {number} [timeout] - Time after which the message will be removed from
 *        the queue. If a callback was provided ti will be called
 * @param {Function} [callback] - Function executed when the timeout is reached
 */
Peer.prototype.send = function(message, timeout, callback) {

  if(!messageIsValid(message)) {
    throw new Error('Message object is invalid')
  }

  let to = message.to
  let timestamp = Date.now()

  if(to === this.id) {
    // Message for itself
    this.dispatchMessage(message)
  } else {
    this.processMessage({ message, callback, timeout, timestamp }, this.queue)
  }
}

/**
 * Send a new request for peers to everyone
 *
 * @function Peer#requestPeer
 * @param {string} [to='-1'] - To whom the node needs to open a connection. '-1'
 *        means no particular peer
 */
Peer.prototype.requestPeer = function(to='-1') {
  this.send({
    type: 'request-peer',
    from: this.id,
    to: to,
    ttl: this.ttl,
    forwardBy: []
  })
}

/**
 * Extract information to define an answer message
 *
 * @function Peer#respondTo
 * @param {Message} message - Original message
 * @param {Object} answer - Values (like data and type) to be sent
 */
Peer.prototype.respondTo = function(message, answer) {
  answer.from = this.id
  answer.to = message.from
  answer.ttl = this.ttl
  answer.forwardBy = []
  answer.route = message.forwardBy
  this.send(answer)
}

/**
 * When the node receives a message for someone else it decrease the ttl by one
 * and forwards it
 *
 * @function Peer#forward
 * @param {Message} message - message to be forwarded
 */
Peer.prototype.forward = function(message) {
  message.ttl -= 1
  message.forwardBy.push(this.id)
  this.send(message)
}

/**
 * Handle an answer type response, the last part of the connecion
 * establishement. Set the remote description on local node. Once the connection
 * will be established, the datachannel event should be triggered indicating
 * that the connexion can be used to send messages.
 *
 * @param {Message} message - An answer containing the remote SDP Description
 *        needed to set up the connection
 */
var onanswer = function(message) {
  //TODO Move logic to peerConection
  //TODO Check status in PeerConnection
  var from = message.from
  var answer = new RTCSessionDescription(message.data)
  var status = this.connections.get(from).status

  // TODO Assert should check the connection status RTCSignalingState which can
  // be stable, have-local-offer, have-remote-offer, have-local-pranswer,
  // have-remote-pranswer or closed
  console.assert(
    this.connections.has(from) && status === 'connecting',
    'Error while connecting to node ' + from + ' : status ' + status)

  this.connections.get(from).setRemoteDescription(
    answer,
    function() {}, // Do nothing, we have to wait for the datachannel to open
    e => { throw e })
}

/**
 * Remote ICECandidates have to be added to the corresponding peerConnection. If
 * the connection is not established yet, we store the data.
 *
 * @param {Message} message - an icecandidate type message
 */
var onicecandidate = function(message) {
  var candidate = new RTCIceCandidate(message.data)
  var from = message.from

  if(!this.connections.has(from)) {
    // Received ICE Candidates before SDP Description we store them
    if(!this.icecandidates.has(from)) {
      this.icecandidates.set(from, new Set([candidate]))
    } else {
      this.icecandidates.get(from).add(candidate)
    }
  } else {
    // The connection already exists
    this.connections.get(from).addIceCandidate(
      candidate,
      function() {},
      e => { throw e })
  }
}

/**
 * Extract the SDPOffer from the received message and respond with a SDPAnswer
 *
 * @param {Message} message - An offer type message containing the remote peer's
 *        SDPOffer
 */
var onoffer = function(message) {
  var remotePeer = message.from
  var remoteSDP = message.data
  var peerConnection = new PeerConnection(this, remotePeer)
  /** Add ICE Candidates if they exist */
  var addIceCandidate = function(remotePeer, peerConnection) {
    if(this.icecandidates.has(remotePeer)) {
      var candidates = this.icecandidates.get(remotePeer)
      var successCallback = function() {}
      candidates.forEach(function(candidate) {
        peerConnection.addIceCandidate(
          candidate,
          successCallback,
          e => { throw e })
      }, this)
      this.icecandidates.delete(remotePeer)
    }
  }

  // Create and send the SDPAnswer
  peerConnection.createSDPAnswer(remoteSDP, answer => {
    this.respondTo(message, {type: 'answer', data: answer})
  })
  // Add ICECandidate to the peer connection if we already have some
  addIceCandidate.call(this, remotePeer, peerConnection)
  // Save the connection
  this.connections.set(remotePeer, peerConnection)
}

/**
 * The remote peer want our mediafile
 * The node begin the connection
 *
 * @param {Message} message - A request for a new connection
 */
var onrequestpeer = function(message) {
  // TODO Check we don't already have the connection
  var remote = message.from
  if(this.connections.has(remote) &&
     this.connections.get(remote).status !== 'close') {
    return
  }

  var peerConnection = new PeerConnection(this, message.from)
  // Setup the communication channel only on one side
  peerConnection.createChannel()
  // Send the SDP Offer once the connection is created
  peerConnection.createSDPOffer(offer => {
    this.respondTo(message, { type: 'offer', data: offer })
  })
  // Save the new connexion
  this.connections.set(message.from, peerConnection)
}

/**
 * Handles recpetion of the first view
 *
 * @param {Message} message - The first view received from the server
 */
var onfirstview = function(message) {
  this.id = message.data.id
  this.view = message.data.view
}

/**
 * Triggered when a DataChannel is openned with a remote peer
 *
 * @param {Message} message - The first view received from the server
 * @param {string} message.from - id of the remote node
 */
var onconnected = function(message) {
  var remote = message.from
  var [messageToSend, rest] = partition(
    (elt => elt.message.to === remote),
    this.queue)
  messageToSend.forEach(elt => this.send(elt.message))
  this.queue = rest
}

/**
 * Check if messages have reached their timeout and executes their callbacks. If
 * a message wasn't send with a timeout it will be kept forever in the queue. If
 * a callback was given it will be triggered when the message is removed from
 * the queue.
 */
var processQueue = function() {
  let now = Date.now()
  let queue = []

  this.queue.forEach(elt => {
    let timeout = elt.timeout
    let timestamp = elt.timestamp

    if(typeof timeout === 'number' && (now - timestamp) > timeout) {
      // Timeout elapsed
      if(typeof elt.callback !== 'undefined') {
        elt.callback()
      }
    } else {
      this.processMessage(elt, queue)
    }
  })

  this.queue = queue
}

/**
 * Tries to send a message depending on the available connections and the type
 * of the message. Non transmitted messages will be stored in a queue.
 *
 * @param {Object} element
 * @param {Message} element.message
 * @param {function} element.callback
 * @param {number} element.timeout
 * @param {number} element.timestamp
 * @param {Array.<Object>} queue
 */
Peer.prototype.processMessage = function(element, queue) {
  let message = element.message
  let to = message.to

  let queueHasPeerRequest = () => containsMatch({
    message: {
      type: 'request-peer',
      from: message.from,
      to: to
    }
  }, queue)

  let addMessageToQueue = () => {
    // Check if the message is a request for a peer connection
    if(contains(message.to, ['signal', 'source'])) {
      queue.push(element)
    } else if(message.type !== 'request-peer' || !queueHasPeerRequest()) {
      queue.push(element)
      if(message.type !== 'request-peer') {
        this.requestPeer(to)
      }
    }
  }

  let isConnectedWith = remote =>
        this.connections.has(remote) &&
        this.connections.get(remote).status === 'open'

  if(isConnectedWith(to)) {
    // Recipient is available and connected
    this.connections.get(message.to).send(message)

  } else if(Array.isArray(message.route) &&
            isConnectedWith(message.route[0])) {
    // The message knows some route
    let to = message.route.shift()
    this.connections.get(to).send(message)

  } else if(contains(message.type, Peer.forwardableTypes)) {
    // Broadcast has side effect
    if(!this.broadcast(message)) {
      addMessageToQueue()
    }
  } else {
    // Wait a little while longer
    addMessageToQueue()
  }
}
